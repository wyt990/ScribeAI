/** 根据转录正文生成简短会议标题 */

export function buildSuggestSessionTitlePrompt(fullText: string): string {
  const excerpt =
    fullText.length > 8000 ? `${fullText.slice(0, 8000)}\n…（后文已截断）` : fullText;

  return `你是一位会议记录助手。请根据以下会议转录，生成一个简短、直观的中文会议标题。

要求：
- 长度约 8–25 个汉字（可含数字，如学年、周次）
- 能概括会议主题，便于日后检索
- 不要使用「草稿」「未命名」等泛称
- 只输出标题本身一行，不要引号、不要解释、不要 Markdown

转录正文：

${excerpt}`;
}
