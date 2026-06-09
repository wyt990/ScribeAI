'use client';

import { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  fetchSummaryTemplates,
  type SummaryTemplateItem,
} from '@/lib/summary-templates';

type SummaryTemplateSelectProps = {
  value?: string;
  onValueChange: (templateId: string, template: SummaryTemplateItem) => void;
  className?: string;
  /** 标记已有纪要的模板 ID */
  generatedTemplateIds?: string[];
};

export function SummaryTemplateSelect({
  value,
  onValueChange,
  className,
  generatedTemplateIds = [],
}: SummaryTemplateSelectProps) {
  const [templates, setTemplates] = useState<SummaryTemplateItem[]>([]);
  const [defaultId, setDefaultId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchSummaryTemplates()
      .then((data) => {
        if (cancelled) return;
        setTemplates(data.templates);
        setDefaultId(data.defaultTemplateId);
        if (!value && data.defaultTemplateId) {
          const t = data.templates.find((x) => x.id === data.defaultTemplateId);
          if (t) onValueChange(data.defaultTemplateId, t);
        }
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅挂载时加载；value 由父组件控制
  }, []);

  const selected = value || defaultId;

  return (
    <Select
      value={selected}
      onValueChange={(id) => {
        const t = templates.find((x) => x.id === id);
        if (t) onValueChange(id, t);
      }}
      disabled={loading || templates.length === 0}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={loading ? '加载模板…' : '选择纪要模板'} />
      </SelectTrigger>
      <SelectContent>
        {templates.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name}
            {t.isDefault ? '（默认）' : ''}
            {t.isSystem ? '' : ' · 我的'}
            {generatedTemplateIds.includes(t.id) ? ' ✓' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
