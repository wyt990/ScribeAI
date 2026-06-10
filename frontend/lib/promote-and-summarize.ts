import { suggestDraftTitle, promoteDraft } from '@/lib/draft-api';
import { resolveSummaryTemplate } from '@/lib/resolve-summary-template';
import { runGenerateSummaryFlow } from '@/lib/session-summary';

export type PromoteAndSummarizeOptions = {
  draftId: string;
  flushDraft?: () => Promise<void>;
  templateId?: string;
  router: { push: (url: string) => void; replace?: (url: string) => void };
  title?: string;
};

export type PromoteAndSummarizeResult = {
  sessionId: string;
  title: string;
};

export async function promoteDraftAndGenerateSummary(
  options: PromoteAndSummarizeOptions
): Promise<PromoteAndSummarizeResult> {
  const { draftId, flushDraft, router } = options;

  if (flushDraft) {
    await flushDraft();
  }

  const title =
    options.title?.trim() ||
    (await suggestDraftTitle(draftId));

  const { transcript } = await promoteDraft(draftId, title);

  let templateId = options.templateId;
  if (!templateId) {
    // 调用方未传 templateId 时（安全兜底），走公共解析逻辑
    const resolved = await resolveSummaryTemplate();
    templateId = resolved.templateId;
  }

  await runGenerateSummaryFlow({
    sessionId: transcript.id,
    templateId,
    regenerate: false,
    navigateToPreview: true,
    router,
  });

  return { sessionId: transcript.id, title };
}
