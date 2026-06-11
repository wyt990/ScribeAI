import { Router } from 'express';
import { verifyUser } from '../../middleware/authMiddleware';
import users from './users';
import settings from './settings';
import stats from './stats';
import content from './content';
import templates from './templates';
import audit from './audit';
import observability from './observability';

const router = Router();

router.use(verifyUser);
router.use('/users', users);
router.use('/settings', settings);
router.use('/stats', stats);
router.use('/content', content);
router.use('/templates', templates);
router.use('/audit', audit);
router.use('/observability', observability);

export default router;
