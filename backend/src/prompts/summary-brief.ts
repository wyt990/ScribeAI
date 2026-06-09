/** 保留的简要纪要模式（旧版单行 prompt 等价） */

export function buildBriefUserPrompt(
  fullText: string,
  meta: { title: string; createdAt: Date }
): string {
  const dateStr = meta.createdAt.toISOString().slice(0, 10);
  return `请用中文对以下会议转录生成简要纪要，包含关键要点、主要决策和待办（如有）。

会议标题: ${meta.title}
日期: ${dateStr}

转录正文:

${fullText}`;
}
