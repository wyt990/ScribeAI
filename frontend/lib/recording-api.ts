export type RecordingScope = 'sessions' | 'drafts';

export type RecordingMeta = {
  hasRecording: boolean;
  exists: boolean;
  finalized: boolean;
  sizeBytes: number | null;
  finalizedAt: string | null;
  recordingId?: string | null;
  segmentCount?: number;
  masterStale?: boolean;
};

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('未登录');
  return { Authorization: `Bearer ${token}` };
}

function userBase(scope: RecordingScope, id: string, suffix: string): string {
  return `/api/${scope}/${id}${suffix}`;
}

function managerBase(kind: 'transcripts' | 'drafts', id: string, suffix: string): string {
  return `/api/manager/content/${kind}/${id}${suffix}`;
}

export async function fetchRecordingMeta(
  scope: RecordingScope,
  id: string,
  manager = false
): Promise<RecordingMeta> {
  const path = manager
    ? managerBase(scope === 'sessions' ? 'transcripts' : 'drafts', id, '/recording/meta')
    : userBase(scope, id, '/recording/meta');

  const res = await fetch(path, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || '获取录音信息失败');
  }
  return res.json() as Promise<RecordingMeta>;
}

export async function loadRecordingBlobUrl(
  scope: RecordingScope,
  id: string,
  manager = false
): Promise<string> {
  const path = manager
    ? managerBase(scope === 'sessions' ? 'transcripts' : 'drafts', id, '/recording')
    : userBase(scope, id, '/recording');

  const res = await fetch(path, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || '加载录音失败');
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function retranscribeRecording(
  scope: RecordingScope,
  id: string,
  manager = false
): Promise<{ fullText: string; durationMs: number }> {
  const path = manager
    ? managerBase(scope === 'sessions' ? 'transcripts' : 'drafts', id, '/retranscribe')
    : userBase(scope, id, '/retranscribe');

  const res = await fetch(path, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || '重跑 ASR 失败');
  }
  return res.json() as Promise<{ fullText: string; durationMs: number }>;
}

export function formatRecordingSize(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
