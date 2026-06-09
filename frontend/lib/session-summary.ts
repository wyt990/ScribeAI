import {
  DEFAULT_SUMMARY_TYPE,
  SUMMARY_TYPE_LABELS,
  type SummaryType,
} from '@/lib/summary-types';

export type SummaryGenerateResult = {
  summary: string;
  summaryType: SummaryType;
  summaryTypeLabel: string;
};

export type GenerateSummaryFlowOptions = {
  sessionId: string;
  summaryType?: SummaryType;
  /** 为 true 时重新生成并覆盖已有纪要 */
  regenerate?: boolean;
  /** regenerate 时是否弹出确认框，默认 true */
  confirmRegenerate?: boolean;
  /** 成功后是否跳转预览页，默认 true */
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
  summaryType: SummaryType = DEFAULT_SUMMARY_TYPE
): string {
  return `/sessions/${sessionId}/summary?summaryType=${summaryType}`;
}

export async function confirmSummaryRegenerate(
  summaryType: SummaryType = DEFAULT_SUMMARY_TYPE
): Promise<boolean> {
  return confirm(
    `确定重新生成「${SUMMARY_TYPE_LABELS[summaryType]}」？将覆盖当前已保存的纪要。`
  );
}

/** 调用后端生成/获取会议纪要 */
export async function generateSessionSummary(
  sessionId: string,
  options: {
    summaryType?: SummaryType;
    regenerate?: boolean;
    token?: string | null;
  } = {}
): Promise<SummaryGenerateResult> {
  const summaryType = options.summaryType ?? DEFAULT_SUMMARY_TYPE;
  const token = getAuthToken(options.token);

  const res = await fetch(`/api/sessions/${sessionId}/summary`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summaryType,
      regenerate: options.regenerate === true,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || '生成纪要失败');
  }

  return res.json() as Promise<SummaryGenerateResult>;
}

/**
 * 生成纪要统一流程：可选确认 → 请求生成 → 可选跳转预览页
 * @returns 生成结果；用户取消重新生成时返回 null
 */
export async function runGenerateSummaryFlow(
  options: GenerateSummaryFlowOptions
): Promise<SummaryGenerateResult | null> {
  const summaryType = options.summaryType ?? DEFAULT_SUMMARY_TYPE;

  if (options.regenerate && options.confirmRegenerate !== false) {
    const ok = await confirmSummaryRegenerate(summaryType);
    if (!ok) return null;
  }

  const data = await generateSessionSummary(options.sessionId, {
    summaryType,
    regenerate: options.regenerate,
    token: options.token,
  });

  if (options.navigateToPreview !== false && options.router) {
    options.router.push(buildSummaryPreviewPath(options.sessionId, summaryType));
  }

  return data;
}
