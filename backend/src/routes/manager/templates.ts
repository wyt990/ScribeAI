import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { requireManager } from '../../middleware/managerMiddleware';
import { formatTemplateListItem } from '../../lib/summary-template-service';
import { writeAuditLog } from '../../lib/audit-log';

const router = Router();
router.use(requireManager);

router.get('/', async (_req, res) => {
  try {
    const templates = await prisma.summaryTemplate.findMany({
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
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({
      templates: templates.map((t) => ({
        ...formatTemplateListItem(t as never),
        owner: t.user ? { id: t.user.id, name: t.user.name, email: t.user.email } : null,
      })),
    });
  } catch (err) {
    console.error('[Manager/Templates] list', err);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

router.get('/pending', async (_req, res) => {
  try {
    const pending = await prisma.summaryTemplate.findMany({
      where: { reviewStatus: 'pending', isPublic: true },
      include: {
        skill: { select: { name: true, slug: true } },
        user: { select: { name: true, email: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ templates: pending });
  } catch (err) {
    console.error('[Manager/Templates] pending', err);
    res.status(500).json({ error: 'Failed to list pending templates' });
  }
});

router.put('/:id/skill', async (req: AuthenticatedRequest, res) => {
  const { rulesMd, stepsMd, outputMd, name } = req.body ?? {};
  try {
    const template = await prisma.summaryTemplate.findUnique({
      where: { id: req.params.id },
      include: { skill: true },
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });

    await prisma.summarySkill.update({
      where: { id: template.skillId },
      data: {
        ...(rulesMd !== undefined ? { rulesMd: String(rulesMd) } : {}),
        ...(stepsMd !== undefined ? { stepsMd: stepsMd ? String(stepsMd) : null } : {}),
        ...(outputMd !== undefined ? { outputMd: String(outputMd) } : {}),
        ...(name ? { name: String(name) } : {}),
        version: { increment: 1 },
      },
    });

    await writeAuditLog({
      userId: req.user!.id,
      action: 'skill.update',
      target: template.skillId,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[Manager/Templates] skill update', err);
    res.status(500).json({ error: 'Failed to update skill' });
  }
});

router.post('/:id/review', async (req: AuthenticatedRequest, res) => {
  const action = String(req.body?.action ?? '');
  if (action !== 'approve' && action !== 'reject') {
    return res.status(400).json({ error: 'action must be approve or reject' });
  }
  try {
    await prisma.summaryTemplate.update({
      where: { id: req.params.id },
      data: {
        reviewStatus: action === 'approve' ? 'approved' : 'rejected',
        isPublic: action === 'approve',
      },
    });
    await writeAuditLog({
      userId: req.user!.id,
      action: `template.review.${action}`,
      target: req.params.id,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[Manager/Templates] review', err);
    res.status(500).json({ error: 'Failed to review template' });
  }
});

export default router;
