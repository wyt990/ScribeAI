export type DraftStatus = 'recording' | 'paused' | 'stopped';

export type Draft = {
  id: string;
  title: string;
  fullText: string | null;
  status: DraftStatus;
  audioMode: string;
  recordingId: string | null;
  hasRecording?: boolean;
  orgId: string | null;
  startedAt: string;
  lastSavedAt: string;
  createdAt: string;
  updatedAt: string;
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchDrafts(): Promise<Draft[]> {
  const res = await fetch('/api/drafts', { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch drafts');
  return res.json();
}

export async function fetchActiveDraft(): Promise<Draft | null> {
  const res = await fetch('/api/drafts/active', { headers: authHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to fetch active draft');
  return res.json();
}

export async function fetchDraft(id: string): Promise<Draft | null> {
  const res = await fetch(`/api/drafts/${id}`, { headers: authHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to fetch draft');
  return res.json();
}

export async function createDraft(data: {
  audioMode: string;
  recordingId?: string;
  orgId?: string | null;
}): Promise<Draft> {
  const res = await fetch('/api/drafts', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (res.status === 409) {
    const body = await res.json();
    return body.draft as Draft;
  }
  if (!res.ok) throw new Error('Failed to create draft');
  return res.json();
}

export async function updateDraft(
  id: string,
  data: Partial<Pick<Draft, 'fullText' | 'status' | 'audioMode' | 'recordingId' | 'title' | 'orgId'>>
): Promise<Draft> {
  const res = await fetch(`/api/drafts/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update draft');
  return res.json();
}

export async function deleteDraft(id: string): Promise<void> {
  const res = await fetch(`/api/drafts/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete draft');
}

export async function suggestDraftTitle(id: string): Promise<string> {
  const res = await fetch(`/api/drafts/${id}/suggest-title`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || '生成标题失败');
  }
  const data = (await res.json()) as { title?: string };
  if (!data.title?.trim()) throw new Error('生成标题失败');
  return data.title.trim();
}

export async function promoteDraft(id: string, title: string): Promise<{ transcript: { id: string } }> {
  const res = await fetch(`/api/drafts/${id}/promote`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ title }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to promote draft');
  }
  return res.json();
}

export function draftPreviewText(fullText: string | null, maxLen = 80): string {
  if (!fullText?.trim()) return '（暂无转录内容）';
  const t = fullText.trim();
  return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
}

export const DRAFT_STATUS_LABEL: Record<DraftStatus, string> = {
  recording: '录音中',
  paused: '已暂停',
  stopped: '已停止',
};
