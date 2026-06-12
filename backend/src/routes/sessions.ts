import express from 'express';
import { prisma } from '../lib/prisma';
import { verifyUser, AuthenticatedRequest } from '../middleware/authMiddleware';
import {
  verifyUserOrShareToken,
  SummaryAuthRequest,
} from '../middleware/summaryShareAuth';
import { generateSummary, getSummaryProviderLabel } from '../lib/summary-llm';
import { createSummaryShareToken } from '../lib/summary-share-token';
import { markdownToDocxBuffer } from '../lib/summary-export-docx';
import { markdownToPdfBuffer } from '../lib/summary-export-pdf';
import { buildSummaryMetaFromTranscript } from '../lib/summary-prompt-builder';
import {
  buildPromptForTemplate,
  formatSummaryResponse,
  getTemplateForUser,
  resolveTemplateForUser,
  templateLegacyType,
  type TemplateWithSkill,
} from '../lib/summary-template-service';
import { parseSummaryType, DEFAULT_SUMMARY_TYPE } from '../prompts/build-summary-prompt';
import { writeOperationTrace } from '../lib/operation-trace';
import { getRecordingMeta, removeRecordingAudio } from '../lib/audio-archive';
import { cleanupOrphanRecordingArchivesForUser } from '../lib/recording-orphan-cleanup';
import { respondRecordingMeta, retranscribeRecording, streamRecording } from '../lib/recording-http';
import { getSttProviderLabel } from '../lib/asr-transcribe';
import { searchUserSessions } from '../lib/session-search';

const router = express.Router();

function safeFilename(title: string): string {
  return title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 80) || 'summary';
}

type SummaryLookup = {
  templateId?: string | null;
  summaryType?: string | null;
};

async function resolveTemplateFromRequest(
  userId: string,
  input: SummaryLookup
): Promise<TemplateWithSkill> {
  return resolveTemplateForUser(userId, {
    templateId: input.templateId,
    summaryType: input.summaryType ?? undefined,
  });
}

async function loadSummaryForSession(
  sessionId: string,
  userId: string,
  lookup: SummaryLookup
) {
  const template = await resolveTemplateFromRequest(userId, lookup);

  const transcript = await prisma.transcript.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      title: true,
      createdAt: true,
      userId: true,
      summaries: { where: { templateId: template.id } },
    },
  });

  if (!transcript || transcript.userId !== userId) return null;
  const summary = transcript.summaries[0];
  if (!summary?.text?.trim()) return null;

  return { transcript, summary, template };
}

function summaryLookupFromQuery(query: Record<string, unknown>): SummaryLookup {
  return {
    templateId: query.templateId ? String(query.templateId) : null,
    summaryType: query.summaryType ? String(query.summaryType) : null,
  };
}

function summaryLookupFromBody(body: Record<string, unknown> | undefined): SummaryLookup {
  return {
    templateId: body?.templateId ? String(body.templateId) : null,
    summaryType: body?.summaryType ? String(body.summaryType) : null,
  };
}

router.get('/search', verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 30));

  if (!q) {
    return res.json({ query: '', results: [] });
  }

  try {
    const results = await searchUserSessions(userId, q, limit);
    res.json({ query: q, results });
  } catch (err) {
    console.error('[Sessions] search', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Fetch all transcripts for user
router.get("/", verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  try {
    const transcripts = await prisma.transcript.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        recordingId: true,
        summaries: {
          select: {
            summaryType: true,
            templateId: true,
            template: { select: { name: true, legacySummaryType: true } },
          },
        },
      },
    });
    res.json(
      transcripts.map(({ summaries, recordingId, ...rest }) => ({
        ...rest,
        hasRecording: recordingId ? getRecordingMeta(userId, recordingId).exists : false,
        hasSummary: summaries.length > 0,
        summaryTypes: summaries.map(
          (s) => s.template.legacySummaryType ?? s.summaryType
        ),
        summaryTemplateIds: summaries.map((s) => s.templateId),
        summaryTemplates: summaries.map((s) => ({
          id: s.templateId,
          name: s.template.name,
          legacySummaryType: s.template.legacySummaryType,
        })),
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch transcripts' });
  }
});

router.get('/:id/recording/meta', verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { id } = req.params;
  try {
    const transcript = await prisma.transcript.findUnique({
      where: { id },
      select: { userId: true, recordingId: true },
    });
    if (!transcript || transcript.userId !== userId) {
      return res.status(404).json({ error: 'Transcript not found' });
    }
    respondRecordingMeta(res, userId, transcript.recordingId);
  } catch (err) {
    console.error('[Sessions] recording meta', err);
    res.status(500).json({ error: 'Failed to load recording meta' });
  }
});

router.get('/:id/recording', verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { id } = req.params;
  try {
    const transcript = await prisma.transcript.findUnique({
      where: { id },
      select: { userId: true, recordingId: true },
    });
    if (!transcript || transcript.userId !== userId) {
      return res.status(404).json({ error: 'Transcript not found' });
    }
    streamRecording(res, userId, transcript.recordingId);
  } catch (err) {
    console.error('[Sessions] recording stream', err);
    res.status(500).json({ error: 'Failed to stream recording' });
  }
});

router.post('/:id/retranscribe', verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const started = Date.now();

  try {
    const transcript = await prisma.transcript.findUnique({
      where: { id },
      select: { id: true, userId: true, recordingId: true },
    });
    if (!transcript || transcript.userId !== userId) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    const { fullText, durationMs } = await retranscribeRecording(userId, transcript.recordingId);
    await prisma.transcript.update({
      where: { id },
      data: { fullText },
    });

    writeOperationTrace({
      userId,
      category: 'recording',
      action: 'retranscribe',
      target: id,
      durationMs,
      detail: { provider: getSttProviderLabel(), recordingId: transcript.recordingId },
    });

    res.json({ success: true, fullText, durationMs });
  } catch (err) {
    writeOperationTrace({
      userId,
      category: 'recording',
      action: 'retranscribe',
      status: 'error',
      target: id,
      durationMs: Date.now() - started,
      detail: {
        provider: getSttProviderLabel(),
        error: err instanceof Error ? err.message : String(err),
      },
    });
    console.error('[Sessions] retranscribe', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to retranscribe recording',
    });
  }
});

// Fetch single transcript with summaries
router.get("/:id", verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const lookup = summaryLookupFromQuery(req.query as Record<string, unknown>);

  try {
    const template = await resolveTemplateFromRequest(userId, lookup);

    const transcript = await prisma.transcript.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        fullText: true,
        createdAt: true,
        orgId: true,
        recordingId: true,
        summaries: {
          select: {
            text: true,
            summaryType: true,
            templateId: true,
            orgId: true,
            template: { select: { name: true, legacySummaryType: true } },
          },
        },
        userId: true,
      },
    });

    if (!transcript || transcript.userId !== userId) {
      return res.status(404).json({ error: "Transcript not found" });
    }

    const matched =
      transcript.summaries.find((s) => s.templateId === template.id) ?? null;

    res.json({
      id: transcript.id,
      title: transcript.title,
      fullText: transcript.fullText,
      createdAt: transcript.createdAt,
      orgId: transcript.orgId,
      hasRecording: transcript.recordingId
        ? getRecordingMeta(userId, transcript.recordingId).exists
        : false,
      recordingFinalized: transcript.recordingId
        ? getRecordingMeta(userId, transcript.recordingId).finalized
        : false,
      summary: matched?.text ?? null,
      summaryType: matched
        ? matched.template.legacySummaryType ?? matched.summaryType
        : null,
      templateId: matched?.templateId ?? template.id,
      templateName: matched?.template.name ?? template.name,
      summaryOrgId: matched?.orgId ?? null,
      summaryTypes: transcript.summaries.map(
        (s) => s.template.legacySummaryType ?? s.summaryType
      ),
      summaryTemplateIds: transcript.summaries.map((s) => s.templateId),
      summaryTemplates: transcript.summaries.map((s) => ({
        id: s.templateId,
        name: s.template.name,
        legacySummaryType: s.template.legacySummaryType,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch transcript" });
  }
});

const SUMMARY_ROUTE_TIMEOUT_MS = Number(process.env.SUMMARY_ROUTE_TIMEOUT_MS || "300000");

// 预览页数据（支持分享令牌）
router.get(
  "/:id/summary/preview",
  verifyUserOrShareToken,
  async (req: SummaryAuthRequest, res) => {
    const { id } = req.params;
    const userId = req.user!.id;
    const lookup: SummaryLookup = req.summaryShare
      ? {
          templateId: req.summaryShare.templateId ?? null,
          summaryType: req.summaryShare.summaryType ?? null,
        }
      : summaryLookupFromQuery(req.query as Record<string, unknown>);

    try {
      const data = await loadSummaryForSession(id, userId, lookup);
      if (!data) {
        return res.status(404).json({ error: "Summary not found" });
      }

      res.json({
        id: data.transcript.id,
        title: data.transcript.title,
        createdAt: data.transcript.createdAt,
        summary: data.summary.text,
        templateId: data.template.id,
        templateName: data.template.name,
        summaryType: templateLegacyType(data.template),
        summaryTypeLabel: data.template.name,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to load summary preview" });
    }
  }
);

// 导出 Word / PDF（支持分享令牌）
router.get(
  "/:id/summary/export",
  verifyUserOrShareToken,
  async (req: SummaryAuthRequest, res) => {
    const { id } = req.params;
    const format = String(req.query.format || "docx").toLowerCase();
    const userId = req.user!.id;
    const lookup: SummaryLookup = req.summaryShare
      ? {
          templateId: req.summaryShare.templateId ?? null,
          summaryType: req.summaryShare.summaryType ?? null,
        }
      : summaryLookupFromQuery(req.query as Record<string, unknown>);

    if (format !== "docx" && format !== "pdf") {
      return res.status(400).json({ error: 'format must be "docx" or "pdf"' });
    }

    try {
      const data = await loadSummaryForSession(id, userId, lookup);
      if (!data) {
        return res.status(404).json({ error: "Summary not found" });
      }

      const baseName = safeFilename(data.transcript.title);

      if (format === "docx") {
        const buffer = await markdownToDocxBuffer(data.summary.text);
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(baseName)}.docx"`
        );
        return res.send(buffer);
      }

      const buffer = await markdownToPdfBuffer(data.summary.text, {
        title: data.transcript.title,
        createdAt: data.transcript.createdAt,
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(baseName)}.pdf"`
      );
      return res.send(buffer);
    } catch (err) {
      console.error("[SummaryExport]", err);
      return res.status(500).json({ error: "Failed to export summary" });
    }
  }
);

// 生成分享链接（需登录）
router.post(
  "/:id/summary/share-link",
  verifyUser,
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { id } = req.params;
    const lookup = summaryLookupFromBody(req.body);

    try {
      const data = await loadSummaryForSession(id, userId, lookup);
      if (!data) {
        return res.status(404).json({ error: "Summary not found" });
      }

      const shareToken = createSummaryShareToken({
        userId,
        sessionId: id,
        templateId: data.template.id,
        summaryType: templateLegacyType(data.template),
      });

      const qs = new URLSearchParams({
        templateId: data.template.id,
        shareToken,
      });
      const legacyType = data.template.legacySummaryType;
      if (legacyType) qs.set('summaryType', legacyType);

      res.json({
        shareToken,
        previewPath: `/sessions/${id}/summary?${qs.toString()}`,
        docxExportPath: `/api/sessions/${id}/summary/export?format=docx&${qs.toString()}`,
        pdfExportPath: `/api/sessions/${id}/summary/export?format=pdf&${qs.toString()}`,
        expiresIn: process.env.SUMMARY_SHARE_TOKEN_EXPIRES || "7d",
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to create share link" });
    }
  }
);

// Generate/fetch summary
router.post("/:id/summary", verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const lookup = summaryLookupFromBody(req.body);
  const regenerate = req.body?.regenerate === true;

  req.setTimeout(SUMMARY_ROUTE_TIMEOUT_MS);
  res.setTimeout(SUMMARY_ROUTE_TIMEOUT_MS);
  req.socket?.setTimeout(SUMMARY_ROUTE_TIMEOUT_MS);

  try {
    const template = await resolveTemplateFromRequest(userId, lookup);

    const [transcript, user, existing] = await Promise.all([
      prisma.transcript.findUnique({ where: { id } }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      }),
      prisma.summary.findUnique({
        where: {
          transcriptId_templateId: {
            transcriptId: id,
            templateId: template.id,
          },
        },
      }),
    ]);

    if (!transcript || transcript.userId !== userId) {
      return res.status(404).json({ error: "Transcript not found" });
    }

    if (!transcript.fullText?.trim()) {
      return res.status(400).json({ error: "Transcript is empty" });
    }

    if (existing && !regenerate) {
      writeOperationTrace({
        userId,
        category: 'summary',
        action: 'summary.cache_hit',
        target: id,
        durationMs: 0,
        detail: { templateId: template.id },
      });
      return res.json(formatSummaryResponse(existing, template));
    }

    // 确定组织上下文：请求体覆盖 → 已有纪要记录 → 转录自带
    const requestedOrgId =
      req.body?.orgId === null || req.body?.orgId === ''
        ? null
        : typeof req.body?.orgId === 'string'
          ? req.body.orgId
          : undefined;
    const effectiveOrgId =
      requestedOrgId !== undefined
        ? requestedOrgId
        : existing?.orgId ?? transcript.orgId ?? null;

    // 查询用户组织上下文
    let userOrgContext: {
      orgName?: string;
      industry?: string;
      jobTitle?: string;
      responsibilities?: string;
    } | undefined;

    if (effectiveOrgId) {
      const uo = await prisma.userOrganization.findUnique({
        where: {
          userId_organizationId: { userId, organizationId: effectiveOrgId },
        },
        include: {
          organization: {
            select: { name: true, industry: true },
          },
        },
      });
      if (uo) {
        userOrgContext = {
          orgName: uo.organization.name,
          industry: uo.organization.industry ?? undefined,
          jobTitle: uo.jobTitle ?? undefined,
          responsibilities: uo.responsibilities ?? undefined,
        };
      }
    }

    const prompt = buildPromptForTemplate(
      template,
      transcript.fullText,
      buildSummaryMetaFromTranscript(transcript, user?.name, userOrgContext)
    );

    const summaryStarted = Date.now();
    const generatedSummary = await generateSummary(prompt);
    const summaryDurationMs = Date.now() - summaryStarted;

    if (!generatedSummary || generatedSummary.trim().length < 5) {
      writeOperationTrace({
        userId,
        category: 'summary',
        action: 'summary.generate',
        status: 'error',
        target: id,
        durationMs: summaryDurationMs,
        detail: {
          templateId: template.id,
          provider: getSummaryProviderLabel(),
          reason: 'empty_response',
        },
      });
      return res.status(500).json({ error: "Summary generation failed" });
    }

    const legacyType = template.legacySummaryType ?? parseSummaryType(lookup.summaryType ?? DEFAULT_SUMMARY_TYPE);

    const savedSummary = await prisma.$transaction(async (tx) => {
      const summary = existing
        ? await tx.summary.update({
            where: { id: existing.id },
            data: {
              text: generatedSummary,
              templateVersion: template.skill.version,
              summaryType: legacyType,
              orgId: effectiveOrgId,
            },
          })
        : await tx.summary.create({
            data: {
              userId,
              transcriptId: transcript.id,
              templateId: template.id,
              templateVersion: template.skill.version,
              summaryType: legacyType,
              orgId: effectiveOrgId,
              text: generatedSummary,
            },
          });

      await tx.transcript.update({
        where: { id: transcript.id },
        data: { orgId: effectiveOrgId },
      });

      return summary;
    });

    writeOperationTrace({
      userId,
      category: 'summary',
      action: 'summary.generate',
      target: id,
      durationMs: summaryDurationMs,
      detail: {
        templateId: template.id,
        provider: getSummaryProviderLabel(),
        regenerate,
        transcriptChars: transcript.fullText.length,
      },
    });

    return res.json(formatSummaryResponse(savedSummary, template));
  } catch (err) {
    console.error(`[SummaryLLM:${getSummaryProviderLabel()}]`, err);
    writeOperationTrace({
      userId,
      category: 'summary',
      action: 'summary.generate',
      status: 'error',
      target: id,
      detail: {
        provider: getSummaryProviderLabel(),
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return res.status(500).json({ error: "Failed to generate/fetch summary" });
  }
});

// Delete transcript (and linked summaries)
router.delete("/:id", verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { id } = req.params;

  try {
    const transcript = await prisma.transcript.findUnique({
      where: { id },
      select: { id: true, userId: true, recordingId: true },
    });

    if (!transcript || transcript.userId !== userId) {
      return res.status(404).json({ error: "Transcript not found" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.summary.deleteMany({ where: { transcriptId: id } });
      await tx.transcript.delete({ where: { id } });
    });

    if (transcript.recordingId) {
      removeRecordingAudio(transcript.userId, transcript.recordingId);
    }
    await cleanupOrphanRecordingArchivesForUser(transcript.userId);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete transcript" });
  }
});

export default router;
