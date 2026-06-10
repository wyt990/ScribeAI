import { Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AuthenticatedRequest } from './authMiddleware';

export async function requireManager(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { role: true, isActive: true },
    });
    if (!user || !user.isActive || user.role !== 'manager') {
      return res.status(403).json({ error: 'Manager access required' });
    }
    next();
  } catch (err) {
    console.error('[ManagerMiddleware]', err);
    return res.status(500).json({ error: 'Authorization failed' });
  }
}
