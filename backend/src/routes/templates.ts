import express from 'express';
import { verifyUser, AuthenticatedRequest } from '../middleware/authMiddleware';
import { generateSummary } from '../lib/summary-llm';
import { buildTemplateGenerateDraftPrompt } from '../prompts/template-generate-draft';
import {
  buildPromptForTemplate,
  deleteUserTemplate,
  forkTemplate,
  formatTemplateListItem,
  getTemplateForUser,
  getUserDefaultTemplateId,
  listTemplatesForUser,
  setUserDefaultTemplate,
  updateTemplateSkill,
} from '../lib/summary-template-service';

const router = express.Router();

const PREVIEW_SAMPLE = `
今天我们讨论了下学期工作安排。张三汇报了招生情况，李四提出要加强宿舍管理。
王五建议下周提交详细方案。会议决定：招生宣传本周五前定稿；宿舍检查方案由李四负责。
`.trim();

function parseTemplateDraftJson(raw: string): {
  name: string;
  description?: string;
  rulesMd: string;
  stepsMd?: string;
  outputMd: string;
} {
  const trimmed = raw.trim();
  const jsonText = trimmed.startsWith('{')
    ? trimmed
    : trimmed.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonText) throw new Error('AI 未返回有效 JSON');

  const parsed = JSON.parse(jsonText) as Record<string, unknown>;
  const name = String(parsed.name ?? '').trim();
  const rulesMd = String(parsed.rulesMd ?? '').trim();
  const outputMd = String(parsed.outputMd ?? '').trim();
  if (!name || !rulesMd || !outputMd) {
    throw new Error('AI 生成的模板缺少必填字段');
  }
  return {
    name: name.slice(0, 120),
    description: String(parsed.description ?? '').trim().slice(0, 2000) || undefined,
    rulesMd: rulesMd.slice(0, 50000),
    stepsMd: String(parsed.stepsMd ?? '').trim().slice(0, 50000) || undefined,
    outputMd: outputMd.slice(0, 50000),
  };
}

/** 列出可用模板（系统 + 我的 + 已审核公共） */
router.get('/', verifyUser, async (req: AuthenticatedRequest, res) => {
  try {
    const items = await listTemplatesForUser(req.user!.id);
    const defaultTemplateId = await getUserDefaultTemplateId(req.user!.id);
    res.json({ templates: items, defaultTemplateId });
  } catch (err) {
    console.error('[Templates] list', err);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

/** AI 生成模板草稿（Phase 2） */
router.post('/generate-draft', verifyUser, async (req: AuthenticatedRequest, res) => {
  const description = String(req.body?.description ?? '').trim();
  const exampleMd = req.body?.exampleMd ? String(req.body.exampleMd) : undefined;
  if (!description && !exampleMd?.trim()) {
    return res.status(400).json({ error: '请提供模板描述或范例纪要' });
  }

  try {
    const prompt = buildTemplateGenerateDraftPrompt(
      description || '请根据范例纪要反推模板结构',
      exampleMd
    );
    const raw = await generateSummary(prompt);
    const draft = parseTemplateDraftJson(raw);
    res.json({ draft });
  } catch (err) {
    console.error('[Templates] generate-draft', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to generate template draft',
    });
  }
});

/** 从 AI 草稿创建用户模板 */
router.post('/', verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { name, description, rulesMd, stepsMd, outputMd, setAsDefault } = req.body ?? {};

  if (!name?.trim() || !rulesMd?.trim() || !outputMd?.trim()) {
    return res.status(400).json({ error: 'name, rulesMd, outputMd are required' });
  }

  try {
    const { prisma } = await import('../lib/prisma');
    const skill = await prisma.summarySkill.create({
      data: {
        userId,
        slug: `custom-${Date.now()}`,
        name: String(name).trim().slice(0, 120),
        rulesMd: String(rulesMd).slice(0, 50000),
        stepsMd: stepsMd ? String(stepsMd).slice(0, 50000) : null,
        outputMd: String(outputMd).slice(0, 50000),
        version: 1,
        reviewStatus: 'approved',
      },
    });

    const template = await prisma.summaryTemplate.create({
      data: {
        userId,
        skillId: skill.id,
        name: String(name).trim().slice(0, 120),
        description: description ? String(description).slice(0, 2000) : null,
        reviewStatus: 'approved',
      },
      include: {
        skill: {
          select: {
            id: true,
            slug: true,
            name: true,
            rulesMd: true,
            stepsMd: true,
            outputMd: true,
            version: true,
            parentId: true,
          },
        },
      },
    });

    if (setAsDefault === true) {
      await setUserDefaultTemplate(template.id, userId);
    }

    res.status(201).json({
      template: formatTemplateListItem(template as never),
      skill: template.skill,
    });
  } catch (err) {
    console.error('[Templates] create', err);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

/** 导入 .skill.json（Phase 3） */
router.post('/import', verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const pack = req.body;
  if (pack?.format !== 'scribeai-skill' || !pack?.skill || !pack?.template) {
    return res.status(400).json({ error: 'Invalid skill package format' });
  }

  try {
    const { prisma } = await import('../lib/prisma');
    const skill = await prisma.summarySkill.create({
      data: {
        userId,
        slug: String(pack.skill.slug ?? `import-${Date.now()}`).slice(0, 120),
        name: String(pack.skill.name ?? pack.template.name).slice(0, 120),
        rulesMd: String(pack.skill.rulesMd).slice(0, 50000),
        stepsMd: pack.skill.stepsMd ? String(pack.skill.stepsMd).slice(0, 50000) : null,
        outputMd: String(pack.skill.outputMd).slice(0, 50000),
        version: Number(pack.skill.version) || 1,
        reviewStatus: 'approved',
      },
    });

    const template = await prisma.summaryTemplate.create({
      data: {
        userId,
        skillId: skill.id,
        name: String(pack.template.name).slice(0, 120),
        description: pack.template.description
          ? String(pack.template.description).slice(0, 2000)
          : null,
        reviewStatus: 'approved',
      },
      include: {
        skill: {
          select: {
            id: true,
            slug: true,
            name: true,
            rulesMd: true,
            stepsMd: true,
            outputMd: true,
            version: true,
            parentId: true,
          },
        },
      },
    });

    res.status(201).json({ template: formatTemplateListItem(template as never) });
  } catch (err) {
    console.error('[Templates] import', err);
    res.status(500).json({ error: 'Failed to import template' });
  }
});

router.get('/:id', verifyUser, async (req: AuthenticatedRequest, res) => {
  try {
    const t = await getTemplateForUser(req.params.id, req.user!.id);
    if (!t) return res.status(404).json({ error: 'Template not found' });
    res.json({
      template: formatTemplateListItem(t),
      skill: t.skill,
    });
  } catch (err) {
    console.error('[Templates] get', err);
    res.status(500).json({ error: 'Failed to load template' });
  }
});

router.post('/:id/fork', verifyUser, async (req: AuthenticatedRequest, res) => {
  try {
    const forked = await forkTemplate(req.params.id, req.user!.id, {
      name: req.body?.name,
    });
    res.status(201).json({
      template: formatTemplateListItem(forked),
      skill: forked.skill,
    });
  } catch (err) {
    console.error('[Templates] fork', err);
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Failed to fork template',
    });
  }
});

router.put('/:id', verifyUser, async (req: AuthenticatedRequest, res) => {
  try {
    const updated = await updateTemplateSkill(req.params.id, req.user!.id, {
      name: req.body?.name,
      description: req.body?.description,
      rulesMd: req.body?.rulesMd,
      stepsMd: req.body?.stepsMd,
      outputMd: req.body?.outputMd,
    });
    res.json({
      template: formatTemplateListItem(updated),
      skill: updated.skill,
    });
  } catch (err) {
    console.error('[Templates] update', err);
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Failed to update template',
    });
  }
});

router.post('/:id/default', verifyUser, async (req: AuthenticatedRequest, res) => {
  try {
    await setUserDefaultTemplate(req.params.id, req.user!.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[Templates] default', err);
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Failed to set default',
    });
  }
});

/** 试跑预览（Phase 2） */
router.post('/:id/preview', verifyUser, async (req: AuthenticatedRequest, res) => {
  const sampleText = String(req.body?.sampleText ?? PREVIEW_SAMPLE).trim();
  if (!sampleText) return res.status(400).json({ error: 'sampleText is required' });

  try {
    const template = await getTemplateForUser(req.params.id, req.user!.id);
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const previewEnd = new Date();
    const previewStart = new Date(previewEnd.getTime() - 45 * 60_000);
    const prompt = buildPromptForTemplate(template, sampleText, {
      title: '模板预览示例会议',
      startedAt: previewStart,
      endedAt: previewEnd,
      recorderName: '预览用户',
    });

    const preview = await generateSummary(prompt);
    res.json({ preview, templateId: template.id, templateName: template.name });
  } catch (err) {
    console.error('[Templates] preview', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Preview generation failed',
    });
  }
});

/** 导出 .skill.json（Phase 3） */
router.get('/:id/export', verifyUser, async (req: AuthenticatedRequest, res) => {
  try {
    const t = await getTemplateForUser(req.params.id, req.user!.id);
    if (!t) return res.status(404).json({ error: 'Template not found' });

    res.json({
      format: 'scribeai-skill',
      version: 1,
      exportedAt: new Date().toISOString(),
      template: {
        name: t.name,
        description: t.description,
      },
      skill: {
        slug: t.skill.slug,
        name: t.skill.name,
        rulesMd: t.skill.rulesMd,
        stepsMd: t.skill.stepsMd,
        outputMd: t.skill.outputMd,
        version: t.skill.version,
      },
    });
  } catch (err) {
    console.error('[Templates] export', err);
    res.status(500).json({ error: 'Failed to export template' });
  }
});

router.post('/:id/submit-public', verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  try {
    const { prisma } = await import('../lib/prisma');
    const t = await prisma.summaryTemplate.findUnique({ where: { id: req.params.id } });
    if (!t || t.userId !== userId) {
      return res.status(404).json({ error: 'Template not found' });
    }
    await prisma.summaryTemplate.update({
      where: { id: req.params.id },
      data: { isPublic: true, reviewStatus: 'pending' },
    });
    res.json({ success: true, reviewStatus: 'pending' });
  } catch (err) {
    console.error('[Templates] submit-public', err);
    res.status(500).json({ error: 'Failed to submit for review' });
  }
});

router.delete('/:id', verifyUser, async (req: AuthenticatedRequest, res) => {
  try {
    await deleteUserTemplate(req.params.id, req.user!.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[Templates] delete', err);
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Failed to delete template',
    });
  }
});

export default router;
