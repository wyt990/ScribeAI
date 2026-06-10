'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { managerApi } from '@/lib/manager-api';

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function ManagerOverviewPage() {
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void managerApi.stats().then(setStats).catch(console.error);
  }, []);

  if (!stats) return <p className="text-muted-foreground">加载中…</p>;

  const cards = [
    { label: '用户数', value: stats.users },
    { label: '会议记录', value: stats.transcripts },
    { label: '草稿', value: stats.drafts },
    { label: '纪要', value: stats.summaries },
    { label: '待审模板', value: stats.pendingTemplateReviews },
    { label: '上传占用', value: formatBytes(Number(stats.uploadsBytes) || 0) },
    { label: 'STT', value: String(stats.sttProvider) },
    { label: '纪要 LLM', value: String(stats.summaryProvider) },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">系统概览</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{String(c.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">上传目录：{String(stats.uploadsDir)}</p>
    </div>
  );
}
