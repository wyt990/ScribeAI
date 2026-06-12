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

export type ManagerUserListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
};

export type ManagerUserListResult = {
  users: ManagerUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type ManagerTraceListParams = {
  page?: number;
  pageSize?: number;
  category?: string;
  status?: string;
};

export type ManagerTraceRow = {
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

export type ManagerTraceListResult = {
  traces: ManagerTraceRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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
    list: (params?: ManagerUserListParams) => {
      const qs = new URLSearchParams();
      if (params?.page) qs.set('page', String(params.page));
      if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
      if (params?.q?.trim()) qs.set('q', params.q.trim());
      const query = qs.toString();
      return managerFetch<ManagerUserListResult>(`/users${query ? `?${query}` : ''}`);
    },
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
    traces: (params?: ManagerTraceListParams) => {
      const qs = new URLSearchParams();
      if (params?.page) qs.set('page', String(params.page));
      if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
      if (params?.category) qs.set('category', params.category);
      if (params?.status) qs.set('status', params.status);
      const query = qs.toString();
      return managerFetch<ManagerTraceListResult>(
        `/observability/traces${query ? `?${query}` : ''}`
      );
    },
  },
};
