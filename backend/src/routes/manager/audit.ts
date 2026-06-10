import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { requireManager } from '../../middleware/managerMiddleware';

const router = Router();
router.use(requireManager);

router.get('/', async (req, res) => {
  const take = Math.min(Number(req.query.limit) || 100, 500);
  try {
    const logs = await prisma.auditLog.findMany({
      take,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    res.json({ logs });
  } catch (err) {
    console.error('[Manager/Audit]', err);
    res.status(500).json({ error: 'Failed to load audit logs' });
  }
});

export default router;
