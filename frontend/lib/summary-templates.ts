export type SummaryTemplateItem = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isPublic: boolean;
  reviewStatus: string;
  isSystem: boolean;
  legacySummaryType: string | null;
  skillVersion: number;
};

export type SummaryTemplateDetail = {
  template: SummaryTemplateItem;
  skill: {
    id: string;
    slug: string;
    name: string;
    rulesMd: string;
    stepsMd: string | null;
    outputMd: string;
    version: number;
    parentId: string | null;
  };
};

export type TemplateDraft = {
  name: string;
  description?: string;
  rulesMd: string;
  stepsMd?: string;
  outputMd: string;
};

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('未登录');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function fetchSummaryTemplates(): Promise<{
  templates: SummaryTemplateItem[];
  defaultTemplateId: string;
}> {
  const res = await fetch('/api/templates', { headers: authHeaders() });
  if (!res.ok) throw new Error('加载模板列表失败');
  return res.json();
}

export async function fetchSummaryTemplate(id: string): Promise<SummaryTemplateDetail> {
  const res = await fetch(`/api/templates/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('加载模板失败');
  return res.json();
}

export async function forkSummaryTemplate(
  id: string,
  name?: string
): Promise<SummaryTemplateDetail> {
  const res = await fetch(`/api/templates/${id}/fork`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || '复制模板失败');
  }
  return res.json();
}

export async function updateSummaryTemplate(
  id: string,
  data: {
    name?: string;
    description?: string;
    rulesMd?: string;
    stepsMd?: string;
    outputMd?: string;
  }
): Promise<SummaryTemplateDetail> {
  const res = await fetch(`/api/templates/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || '保存模板失败');
  }
  return res.json();
}

export async function setDefaultSummaryTemplate(id: string): Promise<void> {
  const res = await fetch(`/api/templates/${id}/default`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('设置默认模板失败');
}

export async function deleteSummaryTemplate(id: string): Promise<void> {
  const res = await fetch(`/api/templates/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || '删除模板失败');
  }
}

export async function generateTemplateDraft(
  description: string,
  exampleMd?: string
): Promise<TemplateDraft> {
  const res = await fetch('/api/templates/generate-draft', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ description, exampleMd }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'AI 生成模板失败');
  }
  const data = await res.json();
  return data.draft as TemplateDraft;
}

export async function createSummaryTemplate(
  draft: TemplateDraft & { setAsDefault?: boolean }
): Promise<SummaryTemplateDetail> {
  const res = await fetch('/api/templates', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(draft),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || '创建模板失败');
  }
  return res.json();
}

export async function previewSummaryTemplate(
  id: string,
  sampleText?: string
): Promise<{ preview: string; templateId: string; templateName: string }> {
  const res = await fetch(`/api/templates/${id}/preview`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ sampleText }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || '预览生成失败');
  }
  return res.json();
}

export async function exportSummaryTemplate(id: string): Promise<unknown> {
  const res = await fetch(`/api/templates/${id}/export`, { headers: authHeaders() });
  if (!res.ok) throw new Error('导出失败');
  return res.json();
}

export async function importSummaryTemplate(pack: unknown): Promise<SummaryTemplateDetail> {
  const res = await fetch('/api/templates/import', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(pack),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || '导入失败');
  }
  return res.json();
}

export async function submitTemplateForPublic(id: string): Promise<void> {
  const res = await fetch(`/api/templates/${id}/submit-public`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('提交审核失败');
}
