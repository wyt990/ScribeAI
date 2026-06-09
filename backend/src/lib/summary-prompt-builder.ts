import { SUMMARY_SYSTEM_GUARDRAILS } from './summary-guardrails';

export type SummaryPromptMeta = {
  title: string;
  createdAt: Date;
  recorderName?: string;
};

export type SkillPromptInput = {
  rulesMd: string;
  stepsMd?: string | null;
  outputMd: string;
};

function buildMetaBlock(meta: SummaryPromptMeta): string {
  const dateStr = meta.createdAt.toISOString().slice(0, 10);
  const recorderName = meta.recorderName?.trim();
  const recorderLine = recorderName
    ? `- 记录人: ${recorderName}（本系统登录用户，即本次会议记录人，请填入纪要头部「**记录**」字段）`
    : '';

  return `## 已知元数据（可填入纪要头部，不足处仍标 TBD）

- 建议标题: ${meta.title}
- 记录日期（可作会议日期参考）: ${dateStr}
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
