/** 保留的简要纪要模式（旧版单行 prompt 等价） */

export function buildBriefUserPrompt(
  fullText: string,
  meta: { title: string; createdAt: Date; recorderName?: string }
): string {
  const dateStr = meta.createdAt.toISOString().slice(0, 10);
  const recorderName = meta.recorderName?.trim();
  const recorderLine = recorderName
    ? `记录人: ${recorderName}（本系统登录用户，即本次会议记录人）\n`
    : "";

  return `请用中文对以下会议转录生成简要纪要，包含关键要点、主要决策和待办（如有）。

会议标题: ${meta.title}
日期: ${dateStr}
${recorderLine}

转录正文:

${fullText}`;
}
