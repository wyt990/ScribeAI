/** 系统内置模板固定 ID（与 migration seed 一致） */
export const SYSTEM_SKILL_MEETING_NOTES_ID = 'sys-skill-meeting-notes';
export const SYSTEM_SKILL_BRIEF_ID = 'sys-skill-brief';
export const SYSTEM_TEMPLATE_MEETING_NOTES_ID = 'sys-tpl-meeting-notes';
export const SYSTEM_TEMPLATE_BRIEF_ID = 'sys-tpl-brief';

export const LEGACY_SUMMARY_TYPES = ['meeting-notes', 'brief'] as const;
export type LegacySummaryType = (typeof LEGACY_SUMMARY_TYPES)[number];

export const DEFAULT_LEGACY_SUMMARY_TYPE: LegacySummaryType = 'meeting-notes';

export function isLegacySummaryType(value: string): value is LegacySummaryType {
  return (LEGACY_SUMMARY_TYPES as readonly string[]).includes(value);
}

export function legacyTypeToSystemTemplateId(type: LegacySummaryType): string {
  return type === 'brief' ? SYSTEM_TEMPLATE_BRIEF_ID : SYSTEM_TEMPLATE_MEETING_NOTES_ID;
}
