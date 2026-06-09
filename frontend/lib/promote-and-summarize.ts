import { suggestDraftTitle, promoteDraft } from '@/lib/draft-api';
import {
  DEFAULT_SUMMARY_TYPE,
  type SummaryType,
} from '@/lib/summary-types';
import { runGenerateSummaryFlow } from '@/lib/session-summary';

export type PromoteAndSummarizeOptions = {
  draftId: string;
  /** 保存最新转录到草稿后再转正 */
  flushDraft?: () => Promise<void>;
  summaryType?: SummaryType;
  router: { push: (url: string) => void; replace?: (url: string) => void };
  /** 使用 AI 建议标题；若提供则跳过 suggest API */
  title?: string;
};

export type PromoteAndSummarizeResult = {
  sessionId: string;
  title: string;
};

/**
 * 录音页一键流程：刷盘 → AI 标题 → 转正 → 生成纪要 → 跳转预览
 */
export async function promoteDraftAndGenerateSummary(
  options: PromoteAndSummarizeOptions
): Promise<PromoteAndSummarizeResult> {
  const { draftId, flushDraft, router } = options;
  const summaryType = options.summaryType ?? DEFAULT_SUMMARY_TYPE;

  if (flushDraft) {
    await flushDraft();
  }

  const title =
    options.title?.trim() ||
    (await suggestDraftTitle(draftId));

  const { transcript } = await promoteDraft(draftId, title);

  await runGenerateSummaryFlow({
    sessionId: transcript.id,
    summaryType,
    regenerate: false,
    navigateToPreview: true,
    router,
  });

  return { sessionId: transcript.id, title };
}
