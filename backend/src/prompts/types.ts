export const SUMMARY_TYPES = ["meeting-notes", "brief"] as const;

export type SummaryType = (typeof SUMMARY_TYPES)[number];

export const DEFAULT_SUMMARY_TYPE: SummaryType = "meeting-notes";

export function parseSummaryType(raw: unknown): SummaryType {
  if (typeof raw === "string" && (SUMMARY_TYPES as readonly string[]).includes(raw)) {
    return raw as SummaryType;
  }
  return DEFAULT_SUMMARY_TYPE;
}

export const SUMMARY_TYPE_LABELS: Record<SummaryType, string> = {
  "meeting-notes": "会议纪要（结构化）",
  brief: "简要摘要",
};
