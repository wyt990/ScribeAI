export type SessionSearchHit = {
  field: 'title' | 'transcript' | 'summary';
  snippet: string;
  snippetHtml: string;
  templateName?: string;
  score: number;
};

export type SessionSearchResult = {
  id: string;
  title: string;
  createdAt: string;
  hasSummary: boolean;
  hasRecording: boolean;
  hits: SessionSearchHit[];
  score: number;
};

export async function searchSessions(query: string, limit = 30): Promise<{
  query: string;
  results: SessionSearchResult[];
}> {
  const token = localStorage.getItem('token');
  const qs = new URLSearchParams({ q: query, limit: String(limit) });
  const res = await fetch(`/api/sessions/search?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || '搜索失败');
  }
  return res.json() as Promise<{ query: string; results: SessionSearchResult[] }>;
}

export const SEARCH_FIELD_LABEL: Record<SessionSearchHit['field'], string> = {
  title: '标题',
  transcript: '转录',
  summary: '纪要',
};
