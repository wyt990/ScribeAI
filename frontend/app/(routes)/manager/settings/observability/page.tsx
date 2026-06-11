'use client';

import { useCallback, useEffect, useState } from 'react';
import { ManagerSettingsForm } from '@/components/manager-settings-form';
import { Button } from '@/components/ui/button';
import { managerApi } from '@/lib/manager-api';

type TraceSummary = {
  windowHours: number;
  total24h: number;
  errors24h: number;
  recordingStarts: number;
  recordingInterruptions: number;
  recordingRecoveries: number;
  vadSegmentCount: number;
  avgSttSegmentMs: number | null;
  avgSummaryGenerateMs: number | null;
  avgSummaryCacheMs: number | null;
};

type TraceRow = {
  id: string;
  category: string;
  action: string;
  status: string;
  durationMs: number | null;
  target: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
};

const CATEGORIES = [
  { value: '', label: '全部分类' },
  { value: 'recording', label: '录音 / STT' },
  { value: 'summary', label: '纪要 LLM' },
  { value: 'socket', label: 'Socket' },
  { value: 'system', label: '系统' },
];

const STATUSES = [
  { value: '', label: '全部状态' },
  { value: 'ok', label: '正常' },
  { value: 'error', label: '错误' },
];

function formatMs(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function detailPreview(detail: Record<string, unknown> | null): string {
  if (!detail) return '—';
  try {
    const s = JSON.stringify(detail);
    return s.length > 80 ? `${s.slice(0, 80)}…` : s;
  } catch {
    return '—';
  }
}

export default function ManagerObservabilityPage() {
  const [summary, setSummary] = useState<TraceSummary | null>(null);
  const [traces, setTraces] = useState<TraceRow[]>([]);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([
        managerApi.observability.summary(),
        managerApi.observability.traces({
          category: category || undefined,
          status: status || undefined,
          limit: 100,
        }),
      ]);
      setSummary(s);
      setTraces(t.traces as TraceRow[]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [category, status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">可观测性</h1>
        <p className="text-sm text-muted-foreground mt-1">
          结构化运行 trace：录音 STT 延迟、VAD 段数、纪要 LLM 耗时与失败原因。近 24 小时统计如下。
        </p>
      </div>

      {summary && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="24h Trace 总数" value={String(summary.total24h)} />
          <StatCard label="24h 错误数" value={String(summary.errors24h)} highlight={summary.errors24h > 0} />
          <StatCard label="录音开始次数" value={String(summary.recordingStarts)} />
          <StatCard
            label="录音中断次数"
            value={String(summary.recordingInterruptions)}
            highlight={summary.recordingInterruptions > 0}
          />
          <StatCard label="录音恢复次数" value={String(summary.recordingRecoveries)} />
          <StatCard label="STT 段数 (VAD/切片)" value={String(summary.vadSegmentCount)} />
          <StatCard label="STT 段均耗时" value={formatMs(summary.avgSttSegmentMs)} />
          <StatCard label="纪要生成均耗时" value={formatMs(summary.avgSummaryGenerateMs)} />
          <StatCard label="纪要缓存命中" value={formatMs(summary.avgSummaryCacheMs)} />
        </div>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-medium">配置</h2>
        <p className="text-sm text-muted-foreground">保存后立即生效（新 trace 按新配置写入）。</p>
        <ManagerSettingsForm group="observability" />
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-medium">运行 Trace</h2>
          <select
            className="border rounded-md px-2 py-1 text-sm bg-background"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <select
            className="border rounded-md px-2 py-1 text-sm bg-background"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            刷新
          </Button>
        </div>

        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3">时间</th>
                <th className="text-left p-3">分类</th>
                <th className="text-left p-3">动作</th>
                <th className="text-left p-3">状态</th>
                <th className="text-left p-3">耗时</th>
                <th className="text-left p-3">用户</th>
                <th className="text-left p-3">目标</th>
                <th className="text-left p-3">详情</th>
              </tr>
            </thead>
            <tbody>
              {loading && traces.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-4 text-muted-foreground">加载中…</td>
                </tr>
              ) : traces.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-4 text-muted-foreground">暂无 trace 记录</td>
                </tr>
              ) : (
                traces.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="p-3 whitespace-nowrap">{new Date(t.createdAt).toLocaleString()}</td>
                    <td className="p-3">{t.category}</td>
                    <td className="p-3 font-mono text-xs">{t.action}</td>
                    <td className="p-3">
                      <span className={t.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}>
                        {t.status}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap">{formatMs(t.durationMs)}</td>
                    <td className="p-3">{t.user?.name ?? '—'}</td>
                    <td className="p-3 font-mono text-xs max-w-[120px] truncate">{t.target ?? '—'}</td>
                    <td className="p-3 font-mono text-xs text-muted-foreground max-w-[200px] truncate" title={detailPreview(t.detail)}>
                      {detailPreview(t.detail)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="border rounded-lg p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold mt-1 ${highlight ? 'text-destructive' : ''}`}>{value}</p>
    </div>
  );
}
