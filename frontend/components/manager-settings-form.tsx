'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { managerApi, type ManagerSettingItem } from '@/lib/manager-api';

type ManagerSettingsFormProps = {
  group: string;
  extraActions?: React.ReactNode;
};

export function ManagerSettingsForm({ group, extraActions }: ManagerSettingsFormProps) {
  const [items, setItems] = useState<ManagerSettingItem[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await managerApi.settings.get(group);
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
  }, [group]);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v.trim()) payload[k] = v.trim();
      }
      const data = await managerApi.settings.patch(group, payload) as {
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
      {items.map((item) => (
        <div key={item.key} className="space-y-1">
          <Label htmlFor={item.key}>{item.label}</Label>
          <Input
            id={item.key}
            type={item.isSecret ? 'password' : 'text'}
            placeholder={item.isSecret ? `当前: ${item.value}` : undefined}
            value={values[item.key] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [item.key]: e.target.value }))}
          />
          {item.isSecret && item.hasValue && (
            <p className="text-xs text-muted-foreground">已配置，留空则不修改</p>
          )}
        </div>
      ))}
      <div className="flex flex-wrap gap-2 items-center">
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? '保存中…' : '保存配置'}
        </Button>
        {extraActions}
      </div>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
