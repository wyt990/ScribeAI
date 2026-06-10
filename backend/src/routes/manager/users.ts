import { Router } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../../lib/prisma';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { requireManager } from '../../middleware/managerMiddleware';
import { writeAuditLog } from '../../lib/audit-log';

const router = Router();
router.use(requireManager);

router.get('/', async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        _count: { select: { transcripts: true, drafts: true } },
      },
    });
    res.json({ users });
  } catch (err) {
    console.error('[Manager/Users] list', err);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { transcripts: true, drafts: true, summaries: true } },
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    console.error('[Manager/Users] get', err);
    res.status(500).json({ error: 'Failed to load user' });
  }
});

router.post('/', async (req: AuthenticatedRequest, res) => {
  const { name, email, password, role } = req.body ?? {};
  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: '姓名、邮箱、密码为必填' });
  }
  try {
    const existing = await prisma.user.findUnique({ where: { email: email.trim() } });
    if (existing) return res.status(400).json({ error: '邮箱已存在' });

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim(),
        password: await bcrypt.hash(password, 10),
        role: role === 'manager' ? 'manager' : 'user',
      },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    });

    await writeAuditLog({
      userId: req.user!.id,
      action: 'user.create',
      target: user.id,
      detail: { email: user.email },
    });

    res.status(201).json({ user });
  } catch (err) {
    console.error('[Manager/Users] create', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.put('/:id', async (req: AuthenticatedRequest, res) => {
  const { name, email, role, isActive } = req.body ?? {};
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(email?.trim() ? { email: email.trim() } : {}),
        ...(role === 'manager' || role === 'user' ? { role } : {}),
        ...(typeof isActive === 'boolean' ? { isActive } : {}),
      },
      select: { id: true, name: true, email: true, role: true, isActive: true, updatedAt: true },
    });

    await writeAuditLog({
      userId: req.user!.id,
      action: 'user.update',
      target: user.id,
    });

    res.json({ user });
  } catch (err) {
    console.error('[Manager/Users] update', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.post('/:id/reset-password', async (req: AuthenticatedRequest, res) => {
  const password = String(req.body?.password ?? '');
  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少 6 位' });
  }
  try {
    await prisma.user.update({
      where: { id: req.params.id },
      data: { password: await bcrypt.hash(password, 10) },
    });
    await writeAuditLog({
      userId: req.user!.id,
      action: 'user.reset_password',
      target: req.params.id,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[Manager/Users] reset-password', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

router.delete('/:id', async (req: AuthenticatedRequest, res) => {
  if (req.params.id === req.user!.id) {
    return res.status(400).json({ error: '不能删除当前登录账号' });
  }
  try {
    await prisma.$transaction(async (tx) => {
      const uid = req.params.id;
      await tx.summary.deleteMany({ where: { userId: uid } });
      await tx.draft.deleteMany({ where: { userId: uid } });
      const transcripts = await tx.transcript.findMany({ where: { userId: uid }, select: { id: true } });
      for (const t of transcripts) {
        await tx.summary.deleteMany({ where: { transcriptId: t.id } });
      }
      await tx.transcript.deleteMany({ where: { userId: uid } });
      await tx.summaryTemplate.deleteMany({ where: { userId: uid } });
      const skills = await tx.summarySkill.findMany({ where: { userId: uid }, select: { id: true } });
      for (const s of skills) {
        await tx.summaryTemplate.deleteMany({ where: { skillId: s.id } });
      }
      await tx.summarySkill.deleteMany({ where: { userId: uid } });
      await tx.user.delete({ where: { id: uid } });
    });

    await writeAuditLog({
      userId: req.user!.id,
      action: 'user.delete',
      target: req.params.id,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[Manager/Users] delete', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
