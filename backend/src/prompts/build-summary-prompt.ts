import { buildBriefUserPrompt } from "./summary-brief";
import { buildMeetingNotesUserPrompt } from "./summary-meeting-notes";
import {
  DEFAULT_SUMMARY_TYPE,
  type SummaryType,
  parseSummaryType,
} from "./types";

export type SummaryPromptMeta = {
  title: string;
  createdAt: Date;
};

export function buildSummaryPrompt(
  summaryType: SummaryType | unknown,
  fullText: string,
  meta: SummaryPromptMeta
): { summaryType: SummaryType; prompt: string } {
  const type = parseSummaryType(summaryType ?? DEFAULT_SUMMARY_TYPE);
  const text = fullText?.trim() ?? "";

  if (!text) {
    throw new Error("Transcript is empty");
  }

  const prompt =
    type === "brief"
      ? buildBriefUserPrompt(text, meta)
      : buildMeetingNotesUserPrompt(text, meta);

  return { summaryType: type, prompt };
}

export {
  parseSummaryType,
  DEFAULT_SUMMARY_TYPE,
  SUMMARY_TYPES,
  SUMMARY_TYPE_LABELS,
  type SummaryType,
} from "./types";
