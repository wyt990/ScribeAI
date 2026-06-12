'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { managerApi, type ManagerSettingItem } from '@/lib/manager-api';

const BOOLEAN_KEYS = new Set(['mobile.show_audio_enhancement_panel']);
const SELECT_KEYS = new Set(['mobile.native_chunk_mode']);

const CHUNK_MODE_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: 'timer', label: '定时' },
];

export function ManagerMobileForm() {
  const [items, setItems] = useState<ManagerSettingItem[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await managerApi.settings.get('mobile');
      setItems(data.settings);
      const init: Record<string, string> = {};
      for (const s of data.settings) {
        init[s.key] = s.isSecret ? '' : s.value;
      }
      setValues(init);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v.trim()) payload[k] = v.trim();
      }
      const data = await managerApi.settings.patch('mobile', payload) as {
        settings: ManagerSettingItem[];
      };
      setItems(data.settings);
      setMessage('已保存');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-muted-foreground text-sm">加载中…</p>;

  return (
    <div className="space-y-4 max-w-xl">
      {items.map((item) => {
        if (BOOLEAN_KEYS.has(item.key)) {
          const checked = values[item.key] === 'true';
          return (
            <div key={item.key} className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor={item.key} className="text-sm font-medium">
                  {item.label.replace(/（.*?）/, '')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {checked ? '显示音频增强面板' : '隐藏音频增强面板，已保存的设置仍生效'}
                </p>
              </div>
              <Switch
                id={item.key}
                checked={checked}
                onCheckedChange={(v) =>
                  setValues((prev) => ({ ...prev, [item.key]: String(v) }))
                }
              />
            </div>
          );
        }

        if (SELECT_KEYS.has(item.key)) {
          return (
            <div key={item.key} className="space-y-1.5">
              <Label htmlFor={item.key}>{item.label.replace(/\(.*?\)/, '')}</Label>
              <Select
                value={values[item.key] ?? 'auto'}
                onValueChange={(v) =>
                  setValues((prev) => ({ ...prev, [item.key]: v }))
                }
              >
                <SelectTrigger id={item.key} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHUNK_MODE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {values[item.key] === 'auto'
                  ? '说完一句（静音后）再发送分片，节省 API 调用'
                  : '按固定秒数切分发送分片'}
              </p>
            </div>
          );
        }

        return (
          <div key={item.key} className="space-y-1">
            <Label htmlFor={item.key}>{item.label}</Label>
            <Input
              id={item.key}
              type={item.isSecret ? 'password' : 'text'}
              placeholder={
                item.isSecret
                  ? `当前: ${item.value}`
                  : !item.hasValue
                    ? '(未配置)'
                    : undefined
              }
              value={values[item.key] ?? ''}
              onChange={(e) =>
                setValues((v) => ({ ...v, [item.key]: e.target.value }))
              }
            />
            {item.isSecret && item.hasValue && (
              <p className="text-xs text-muted-foreground">已配置，留空则不修改</p>
            )}
            {!item.isSecret && !item.hasValue && (
              <p className="text-xs text-muted-foreground">未配置此项，保存后将写入此值</p>
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap gap-2 items-center pt-2">
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? '保存中…' : '保存配置'}
        </Button>
      </div>
      {message && (
        <p className="text-sm text-muted-foreground">{message}</p>
      )}
    </div>
  );
}
