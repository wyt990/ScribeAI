import { suggestDraftTitle, promoteDraft } from '@/lib/draft-api';
import { fetchSummaryTemplates } from '@/lib/summary-templates';
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
    const { defaultTemplateId } = await fetchSummaryTemplates();
    templateId = defaultTemplateId;
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
