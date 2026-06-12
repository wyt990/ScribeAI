'use client';

import { useCallback, useEffect, useState } from 'react';
import { ManagerObservabilityForm } from '@/components/manager-observability-form';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { managerApi, type ManagerTraceRow } from '@/lib/manager-api';
import { localizeError } from '@/lib/localize-error';

const PAGE_SIZE = 20;

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
  const [traces, setTraces] = useState<ManagerTraceRow[]>([]);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingTraces, setLoadingTraces] = useState(true);
  const [traceError, setTraceError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const s = await managerApi.observability.summary();
      setSummary(s);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  const loadTraces = useCallback(async () => {
    setLoadingTraces(true);
    setTraceError(null);
    try {
      const data = await managerApi.observability.traces({
        page,
        pageSize: PAGE_SIZE,
        category: category || undefined,
        status: status || undefined,
      });
      setTraces(data.traces);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      if (data.page !== page) setPage(data.page);
    } catch (err) {
      console.error(err);
      setTraces([]);
      setTraceError(localizeError(err instanceof Error ? err.message : '加载 trace 失败'));
    } finally {
      setLoadingTraces(false);
    }
  }, [page, category, status]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    void loadTraces();
  }, [loadTraces]);

  const handleFilterChange = (nextCategory: string, nextStatus: string) => {
    setCategory(nextCategory);
    setStatus(nextStatus);
    setPage(1);
  };

  const refreshAll = () => {
    void loadSummary();
    void loadTraces();
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">可观测性</h1>
        <p className="text-sm text-muted-foreground mt-1">
          结构化运行 trace：录音 STT 延迟、VAD 段数、纪要 LLM 耗时与失败原因。近 24 小时统计如下。
        </p>
      </div>

      {loadingSummary && !summary ? (
        <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
          <Spinner className="size-4" />
          加载统计…
        </p>
      ) : summary ? (
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
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-medium">配置</h2>
        <p className="text-sm text-muted-foreground">保存后立即生效（新 trace 按新配置写入）。</p>
        <ManagerObservabilityForm />
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-medium">运行 Trace</h2>
          <select
            className="border rounded-md px-2 py-1 text-sm bg-background"
            value={category}
            onChange={(e) => handleFilterChange(e.target.value, status)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <select
            className="border rounded-md px-2 py-1 text-sm bg-background"
            value={status}
            onChange={(e) => handleFilterChange(category, e.target.value)}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={loadingSummary || loadingTraces}
          >
            刷新
          </Button>
        </div>

        {traceError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {traceError}
          </div>
        )}

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
              {loadingTraces && traces.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Spinner className="size-4" />
                      加载中…
                    </span>
                  </td>
                </tr>
              ) : traces.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    暂无 trace 记录
                  </td>
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
                    <td
                      className="p-3 font-mono text-xs text-muted-foreground max-w-[200px] truncate"
                      title={detailPreview(t.detail)}
                    >
                      {detailPreview(t.detail)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!traceError && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <p>
              共 {total} 条
              {totalPages > 1 ? ` · 第 ${page} / ${totalPages} 页` : ''}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={loadingTraces || page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={loadingTraces || page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                下一页
              </Button>
            </div>
          </div>
        )}
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
