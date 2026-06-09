import type { SummaryType } from '@/lib/summary-types';

export function buildExportUrl(
  sessionId: string,
  format: 'docx' | 'pdf',
  summaryType: SummaryType,
  shareToken?: string | null
) {
  const params = new URLSearchParams({
    format,
    summaryType,
  });
  if (shareToken) params.set('shareToken', shareToken);
  return `/api/sessions/${sessionId}/summary/export?${params.toString()}`;
}

export async function downloadSummaryExport(
  sessionId: string,
  format: 'docx' | 'pdf',
  summaryType: SummaryType,
  opts?: { shareToken?: string | null; token?: string | null }
) {
  const url = buildExportUrl(sessionId, format, summaryType, opts?.shareToken);
  const headers: Record<string, string> = {};
  if (!opts?.shareToken && opts?.token) {
    headers.Authorization = `Bearer ${opts.token}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || '导出失败');
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1]
    ? decodeURIComponent(match[1])
    : `summary.${format}`;

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}
