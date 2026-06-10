import { Router } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { requireManager } from '../../middleware/managerMiddleware';
import {
  getSettingsByGroup,
  updateSettings,
  type SettingGroup,
} from '../../lib/system-settings';
import { writeAuditLog } from '../../lib/audit-log';
import { generateSummary } from '../../lib/summary-llm';

const router = Router();
router.use(requireManager);

const GROUPS: SettingGroup[] = ['stt', 'llm', 'storage', 'security', 'mobile'];

function parseGroup(raw: string): SettingGroup | null {
  return GROUPS.includes(raw as SettingGroup) ? (raw as SettingGroup) : null;
}

router.get('/:group', async (req, res) => {
  const group = parseGroup(req.params.group);
  if (!group) return res.status(400).json({ error: 'Invalid settings group' });
  try {
    const settings = await getSettingsByGroup(group);
    res.json({ group, settings });
  } catch (err) {
    console.error('[Manager/Settings] get', err);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

router.patch('/:group', async (req: AuthenticatedRequest, res) => {
  const group = parseGroup(req.params.group);
  if (!group) return res.status(400).json({ error: 'Invalid settings group' });
  try {
    await updateSettings(group, req.body ?? {}, req.user!.id);
    await writeAuditLog({
      userId: req.user!.id,
      action: 'settings.update',
      target: group,
      detail: { keys: Object.keys(req.body ?? {}) },
    });
    const settings = await getSettingsByGroup(group);
    res.json({ group, settings });
  } catch (err) {
    console.error('[Manager/Settings] patch', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

router.post('/llm/test', async (_req, res) => {
  try {
    const result = await generateSummary('请回复：连接成功');
    res.json({ ok: true, preview: result.slice(0, 200) });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'LLM 连接失败',
    });
  }
});

export default router;
