export const SUMMARY_TYPES = ["meeting-notes", "brief"] as const;

export type SummaryType = (typeof SUMMARY_TYPES)[number];

export const DEFAULT_SUMMARY_TYPE: SummaryType = "meeting-notes";

export const SUMMARY_TYPE_LABELS: Record<SummaryType, string> = {
  "meeting-notes": "会议纪要（结构化）",
  brief: "简要纪要",
};

export function isSummaryType(value: string): value is SummaryType {
  return (SUMMARY_TYPES as readonly string[]).includes(value);
}
