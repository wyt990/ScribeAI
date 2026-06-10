export type SummaryGenerateResult = {
  summary: string;
  templateId: string;
  templateName: string;
  templateVersion?: number;
  /** legacy 兼容 */
  summaryType?: string;
  summaryTypeLabel: string;
  orgId?: string | null;
};

export type GenerateSummaryFlowOptions = {
  sessionId: string;
  templateId?: string;
  /** legacy：无 templateId 时后端按 summaryType 解析系统模板 */
  summaryType?: string;
  /** 生成纪要时选用的组织身份 */
  orgId?: string | null;
  regenerate?: boolean;
  confirmRegenerate?: boolean;
  navigateToPreview?: boolean;
  router?: { push: (url: string) => void };
  token?: string | null;
};

function getAuthToken(token?: string | null): string {
  const value = token ?? (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
  if (!value) throw new Error('未登录');
  return value;
}

export function buildSummaryPreviewPath(
  sessionId: string,
  templateId: string
): string {
  return `/sessions/${sessionId}/summary?templateId=${encodeURIComponent(templateId)}`;
}

export async function confirmSummaryRegenerate(
  templateName: string
): Promise<boolean> {
  return confirm(
    `确定重新生成「${templateName}」？将覆盖当前已保存的纪要。`
  );
}

export async function generateSessionSummary(
  sessionId: string,
  options: {
    templateId?: string;
    summaryType?: string;
    orgId?: string | null;
    regenerate?: boolean;
    token?: string | null;
  } = {}
): Promise<SummaryGenerateResult> {
  const token = getAuthToken(options.token);
  const body: Record<string, unknown> = {
    regenerate: options.regenerate === true,
  };
  if (options.templateId) body.templateId = options.templateId;
  if (options.summaryType) body.summaryType = options.summaryType;
  if (options.orgId !== undefined) body.orgId = options.orgId;

  const res = await fetch(`/api/sessions/${sessionId}/summary`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || '生成纪要失败');
  }

  return res.json() as Promise<SummaryGenerateResult>;
}

export async function runGenerateSummaryFlow(
  options: GenerateSummaryFlowOptions
): Promise<SummaryGenerateResult | null> {
  if (options.regenerate && options.confirmRegenerate !== false) {
    const label = options.templateId ? '该模板' : '当前纪要';
    const ok = await confirmSummaryRegenerate(label);
    if (!ok) return null;
  }

  const data = await generateSessionSummary(options.sessionId, {
    templateId: options.templateId,
    summaryType: options.summaryType,
    orgId: options.orgId,
    regenerate: options.regenerate,
    token: options.token,
  });

  if (options.navigateToPreview !== false && options.router && data.templateId) {
    options.router.push(buildSummaryPreviewPath(options.sessionId, data.templateId));
  }

  return data;
}
