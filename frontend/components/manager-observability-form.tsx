'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { managerApi, type ManagerSettingItem } from '@/lib/manager-api';

const BOOLEAN_KEYS = new Set([
  'observability.enabled',
  'observability.log_to_console',
]);

export function ManagerObservabilityForm() {
  const [items, setItems] = useState<ManagerSettingItem[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await managerApi.settings.get('observability');
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
      const data = await managerApi.settings.patch('observability', payload) as {
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
          const descriptions: Record<string, string> = {
            'observability.enabled': checked
              ? '录音、STT、纪要等运行 trace 写入数据库'
              : '不写入运行 trace，可观测性页面无数据',
            'observability.log_to_console': checked
              ? '所有操作 trace 同步输出到后端控制台（JSON 格式）'
              : '仅 error 级别日志写入控制台',
          };
          return (
            <div key={item.key} className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor={item.key} className="text-sm font-medium">
                  {item.label}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {descriptions[item.key] ?? (checked ? '已启用' : '已关闭')}
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

        return (
          <div key={item.key} className="space-y-1">
            <Label htmlFor={item.key}>{item.label}</Label>
            <Input
              id={item.key}
              type="text"
              placeholder={!item.hasValue ? '(未配置)' : undefined}
              value={values[item.key] ?? ''}
              onChange={(e) =>
                setValues((v) => ({ ...v, [item.key]: e.target.value }))
              }
            />
            {!item.hasValue && (
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
