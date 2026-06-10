import { SUMMARY_SYSTEM_GUARDRAILS } from './summary-guardrails';

export type SummaryPromptMeta = {
  title: string;
  /** 录音开始时间（草稿 startedAt → Transcript.recordedAt） */
  startedAt: Date;
  /** 会议结束/转正保存时间（Transcript.createdAt） */
  endedAt?: Date;
  recorderName?: string;
};

/** 从正式会话记录组装纪要元数据 */
export function buildSummaryMetaFromTranscript(
  transcript: {
    title: string;
    recordedAt: Date | null;
    createdAt: Date;
  },
  recorderName?: string
): SummaryPromptMeta {
  return {
    title: transcript.title,
    startedAt: transcript.recordedAt ?? transcript.createdAt,
    endedAt: transcript.createdAt,
    recorderName,
  };
}

export type SkillPromptInput = {
  rulesMd: string;
  stepsMd?: string | null;
  outputMd: string;
};

function formatDateTime(date: Date): string {
  const y = date.getFullYear();
  const M = date.getMonth() + 1;
  const d = date.getDate();
  const h = date.getHours();
  const m = date.getMinutes();
  const ampm = h < 12 ? '上午' : '下午';
  const h12 = h % 12 || 12;
  return `${y}年${M}月${d}日 ${ampm}${h12}:${String(m).padStart(2, '0')}`;
}

function formatTimeOnly(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes();
  const ampm = h < 12 ? '上午' : '下午';
  const h12 = h % 12 || 12;
  return `${ampm}${h12}:${String(m).padStart(2, '0')}`;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function hasDistinctEndTime(start: Date, end?: Date): end is Date {
  return !!end && end.getTime() > start.getTime();
}

function formatMeetingTimeRange(start: Date, end: Date): string {
  if (!isSameCalendarDay(start, end)) {
    return `${formatDateTime(start)}–${formatDateTime(end)}`;
  }

  const datePart = `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日`;
  const startAmpm = start.getHours() < 12 ? '上午' : '下午';
  const endAmpm = end.getHours() < 12 ? '上午' : '下午';
  const startH = start.getHours() % 12 || 12;
  const endH = end.getHours() % 12 || 12;
  const startM = String(start.getMinutes()).padStart(2, '0');
  const endM = String(end.getMinutes()).padStart(2, '0');

  if (startAmpm === endAmpm) {
    return `${datePart} ${startAmpm}${startH}:${startM}–${endH}:${endM}`;
  }
  return `${datePart} ${startAmpm}${startH}:${startM}–${endAmpm}${endH}:${endM}`;
}

function buildMetaBlock(meta: SummaryPromptMeta): string {
  const startStr = formatDateTime(meta.startedAt);
  const recorderName = meta.recorderName?.trim();
  const recorderLine = recorderName
    ? `- 记录人: ${recorderName}（本系统登录用户，即本次会议记录人，请填入纪要头部「**记录**」字段）`
    : '';

  const endTimeLine = hasDistinctEndTime(meta.startedAt, meta.endedAt)
    ? `- 会议结束时间: ${formatDateTime(meta.endedAt)}（转正保存为正式会话的时间）\n`
    : '';

  const rangeLine = hasDistinctEndTime(meta.startedAt, meta.endedAt)
    ? `- 建议时间字段: ${formatMeetingTimeRange(meta.startedAt, meta.endedAt)}\n`
    : '';

  const timeHint = hasDistinctEndTime(meta.startedAt, meta.endedAt)
    ? '- 时间字段填写说明: 起止时间均已提供，请写「YYYY 年 M 月 D 日 上午/下午 H:MM–H:MM」格式。'
    : '- 时间字段填写说明: 仅知开始时间时只写开始时刻；完全未知写 TBD。禁止输出「10:52-TBD」这类把 TBD 接在时间点后的格式。';

  return `## 已知元数据（可填入纪要头部，不足处仍标 TBD）

- 建议标题: ${meta.title}
- 会议开始时间: ${startStr}（录音开始时间）
${endTimeLine}${rangeLine}${timeHint}
${recorderLine ? `${recorderLine}\n` : ''}`;
}

/** 从 Skill 配置组装完整 LLM prompt */
export function buildPromptFromTemplate(
  skill: SkillPromptInput,
  fullText: string,
  meta: SummaryPromptMeta
): string {
  const text = fullText?.trim() ?? '';
  if (!text) throw new Error('Transcript is empty');

  const stepsBlock = skill.stepsMd?.trim()
    ? `## 处理步骤\n\n${skill.stepsMd.trim()}\n\n---\n\n`
    : '';

  return `${SUMMARY_SYSTEM_GUARDRAILS}

${skill.rulesMd.trim()}

${buildMetaBlock(meta)}

## 输出模板（请严格按此结构填写）

${skill.outputMd.trim()}

---

${stepsBlock}## 转录正文

${text}`;
}
