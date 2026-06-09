/** AI 辅助生成纪要模板草稿 */

export function buildTemplateGenerateDraftPrompt(
  description: string,
  exampleMd?: string
): string {
  const exampleBlock = exampleMd?.trim()
    ? `\n\n## 用户提供的范例纪要\n\n${exampleMd.trim().slice(0, 12000)}`
    : '';

  return `你是一位会议纪要模板设计助手。请根据用户需求，生成一套可用于 LLM 的会议纪要模板配置。

用户需求：
${description.trim().slice(0, 4000)}${exampleBlock}

请**只输出一个 JSON 对象**（不要 Markdown 代码围栏），字段如下：
{
  "name": "模板名称，8-30字",
  "description": "一句话说明适用场景",
  "rulesMd": "整理规则（Markdown），含忠实转录、禁止编造等",
  "stepsMd": "可选处理步骤（Markdown）",
  "outputMd": "输出 Markdown 骨架，含占位符"
}

要求：
- 全部使用中文
- outputMd 须为可填写的纪要结构骨架
- rulesMd 须强调只写转录中有的内容
- 不要输出 JSON 以外的任何文字`;
}
