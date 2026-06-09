# Backend Skills

本目录存放**会议纪要等 LLM 任务**引用的 Agent Skill 原文（`SKILL.md`、模板等），与 `src/prompts/` 中的可执行 prompt 代码配套。

| 目录 | 用途 | 对应 prompt |
|------|------|-------------|
| `transcript-to-meeting-notes/` | 结构化会议纪要 skill | `src/prompts/summary-meeting-notes.ts` |

新增 skill 时：在此目录添加子文件夹，并在 `src/prompts/` 增加对应的 prompt 构建模块。
