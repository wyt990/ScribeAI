function headers(): Record<string, string> {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('未登录');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function managerFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/manager${path}`, {
    ...init,
    headers: { ...headers(), ...init?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || '请求失败');
  }
  return res.json() as Promise<T>;
}

export type ManagerUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  _count?: { transcripts: number; drafts: number; summaries?: number };
};

export type ManagerSettingItem = {
  key: string;
  label: string;
  group: string;
  isSecret: boolean;
  value: string;
  hasValue: boolean;
};

export const managerApi = {
  stats: () => managerFetch<Record<string, unknown>>('/stats'),
  users: {
    list: () => managerFetch<{ users: ManagerUser[] }>('/users'),
    get: (id: string) => managerFetch<{ user: ManagerUser }>(`/users/${id}`),
    create: (body: { name: string; email: string; password: string; role?: string }) =>
      managerFetch('/users', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<{ name: string; email: string; role: string; isActive: boolean }>) =>
      managerFetch(`/users/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    resetPassword: (id: string, password: string) =>
      managerFetch(`/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) }),
    delete: (id: string) => managerFetch(`/users/${id}`, { method: 'DELETE' }),
  },
  settings: {
    get: (group: string) =>
      managerFetch<{ group: string; settings: ManagerSettingItem[] }>(`/settings/${group}`),
    patch: (group: string, updates: Record<string, string>) =>
      managerFetch(`/settings/${group}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    testLlm: () => managerFetch<{ ok: boolean; preview?: string; error?: string }>('/settings/llm/test', { method: 'POST' }),
  },
  content: {
    transcripts: () => managerFetch<{ transcripts: unknown[] }>('/content/transcripts'),
    deleteTranscript: (id: string) => managerFetch(`/content/transcripts/${id}`, { method: 'DELETE' }),
    drafts: () => managerFetch<{ drafts: unknown[] }>('/content/drafts'),
    deleteDraft: (id: string) => managerFetch(`/content/drafts/${id}`, { method: 'DELETE' }),
  },
  templates: {
    list: () => managerFetch<{ templates: unknown[] }>('/templates'),
    pending: () => managerFetch<{ templates: unknown[] }>('/templates/pending'),
    review: (id: string, action: 'approve' | 'reject') =>
      managerFetch(`/templates/${id}/review`, { method: 'POST', body: JSON.stringify({ action }) }),
    updateSkill: (id: string, body: Record<string, string>) =>
      managerFetch(`/templates/${id}/skill`, { method: 'PUT', body: JSON.stringify(body) }),
  },
  audit: {
    list: () => managerFetch<{ logs: unknown[] }>('/audit'),
  },
  observability: {
    summary: () =>
      managerFetch<{
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
      }>('/observability/summary'),
    traces: (params?: { category?: string; status?: string; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.category) qs.set('category', params.category);
      if (params?.status) qs.set('status', params.status);
      if (params?.limit) qs.set('limit', String(params.limit));
      const q = qs.toString();
      return managerFetch<{ traces: unknown[] }>(`/observability/traces${q ? `?${q}` : ''}`);
    },
  },
};
