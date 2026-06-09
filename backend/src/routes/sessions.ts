import express from 'express';
import { prisma } from '../lib/prisma';
import { verifyUser, AuthenticatedRequest } from '../middleware/authMiddleware';
import { generateSummary, getSummaryProviderLabel } from '../lib/summary-llm';
import {
  buildSummaryPrompt,
  parseSummaryType,
  DEFAULT_SUMMARY_TYPE,
  SUMMARY_TYPE_LABELS,
  type SummaryType,
} from '../prompts/build-summary-prompt';

const router = express.Router();

function formatSummaryPayload(summary: { text: string; summaryType: string }) {
  return {
    summary: summary.text,
    summaryType: summary.summaryType,
    summaryTypeLabel:
      SUMMARY_TYPE_LABELS[summary.summaryType as SummaryType] ?? summary.summaryType,
  };
}

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
        summaries: { select: { summaryType: true } },
      },
    });
    res.json(
      transcripts.map(({ summaries, ...rest }) => ({
        ...rest,
        hasSummary: summaries.length > 0,
        summaryTypes: summaries.map((s) => s.summaryType),
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch transcripts' });
  }
});

// Fetch single transcript with summaries
router.get("/:id", verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const requestedType = req.query.summaryType
    ? parseSummaryType(String(req.query.summaryType))
    : DEFAULT_SUMMARY_TYPE;

  try {
    const transcript = await prisma.transcript.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        fullText: true,
        createdAt: true,
        summaries: { select: { text: true, summaryType: true } },
        userId: true,
      },
    });

    if (!transcript || transcript.userId !== userId) {
      return res.status(404).json({ error: "Transcript not found" });
    }

    const matched =
      transcript.summaries.find((s) => s.summaryType === requestedType) ??
      transcript.summaries[0] ??
      null;

    res.json({
      id: transcript.id,
      title: transcript.title,
      fullText: transcript.fullText,
      createdAt: transcript.createdAt,
      summary: matched?.text ?? null,
      summaryType: matched?.summaryType ?? null,
      summaryTypes: transcript.summaries.map((s) => s.summaryType),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch transcript" });
  }
});

const SUMMARY_ROUTE_TIMEOUT_MS = Number(process.env.SUMMARY_ROUTE_TIMEOUT_MS || "300000");

// Generate/fetch summary
router.post("/:id/summary", verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const summaryType = parseSummaryType(req.body?.summaryType);
  const regenerate = req.body?.regenerate === true;

  req.setTimeout(SUMMARY_ROUTE_TIMEOUT_MS);
  res.setTimeout(SUMMARY_ROUTE_TIMEOUT_MS);
  req.socket?.setTimeout(SUMMARY_ROUTE_TIMEOUT_MS);

  try {
    const transcript = await prisma.transcript.findUnique({
      where: { id },
      include: {
        summaries: { where: { summaryType } },
      },
    });

    if (!transcript || transcript.userId !== userId) {
      return res.status(404).json({ error: "Transcript not found" });
    }

    if (!transcript.fullText?.trim()) {
      return res.status(400).json({ error: "Transcript is empty" });
    }

    const existing = transcript.summaries[0];
    if (existing && !regenerate) {
      return res.json(formatSummaryPayload(existing));
    }

    const { prompt } = buildSummaryPrompt(summaryType, transcript.fullText, {
      title: transcript.title,
      createdAt: transcript.createdAt,
    });

    const generatedSummary = await generateSummary(prompt);

    if (!generatedSummary || generatedSummary.trim().length < 5) {
      return res.status(500).json({ error: "Summary generation failed" });
    }

    const savedSummary = existing
      ? await prisma.summary.update({
          where: { id: existing.id },
          data: { text: generatedSummary },
        })
      : await prisma.summary.create({
          data: {
            userId,
            transcriptId: transcript.id,
            summaryType,
            text: generatedSummary,
          },
        });

    return res.json(formatSummaryPayload(savedSummary));
  } catch (err) {
    console.error(`[SummaryLLM:${getSummaryProviderLabel()}]`, err);
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
      select: { id: true, userId: true },
    });

    if (!transcript || transcript.userId !== userId) {
      return res.status(404).json({ error: "Transcript not found" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.summary.deleteMany({ where: { transcriptId: id } });
      await tx.transcript.delete({ where: { id } });
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete transcript" });
  }
});

export default router;
