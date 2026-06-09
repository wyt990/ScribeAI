import {
  DEFAULT_SUMMARY_TYPE,
  type SummaryType,
  parseSummaryType,
} from "./types";

export type { SummaryPromptMeta } from "../lib/summary-prompt-builder";

/** @deprecated 请使用 summary-template-service.buildPromptForTemplate；保留 parseSummaryType 供 legacy API */
export function buildSummaryPrompt(
  summaryType: SummaryType | unknown,
  _fullText: string,
  _meta: { title: string; createdAt: Date; recorderName?: string }
): { summaryType: SummaryType; prompt: string } {
  const type = parseSummaryType(summaryType ?? DEFAULT_SUMMARY_TYPE);
  throw new Error(
    `buildSummaryPrompt is deprecated; use templateId via summary-template-service (legacy type: ${type})`
  );
}

export {
  parseSummaryType,
  DEFAULT_SUMMARY_TYPE,
  SUMMARY_TYPES,
  SUMMARY_TYPE_LABELS,
  type SummaryType,
} from "./types";
