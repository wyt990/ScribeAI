# ScribeAI 会话纪要 Skills 分析与集成建议

> 文档日期：2026-06-09  
> 用途：记录 GitHub 上与会话记录/会议纪要相关的 Agent Skills 调研结果，以及针对 ScribeAI 产品集成的优先级与实施方案，供后续开发参考。

---

## 1. 背景与目标

ScribeAI 的核心链路：

```
录音 → ASR 实时转写 → 保存 fullText → 用户点击「摘要」→ Gemini 生成纪要
```

当前摘要实现极为简单（`backend/src/routes/sessions.ts`）：

```typescript
const prompt = `Summarize the following transcript with all important key points:\n\n${transcript.fullText}`;
```

**问题**：转录能力已有，但「整理成结构化会话纪要」这一步几乎没有设计。

**Skills 的价值**：GitHub 上的 Agent Skills（`SKILL.md` 格式）提供了成熟的**输出模板、信息提取规则和 prompt 范式**。这些资源应迁入 ScribeAI 后端的 prompt 模块，**而不是**安装到 Cursor IDE 中使用。

---

## 2. GitHub 相关 Skills 一览

### 2.1 转录 → 会议纪要（直接相关）

| Skill | 仓库 | 用途 |
|---|---|---|
| **transcript-to-meeting-notes** | [rushikeshpol02/pm-ai-skills](https://github.com/rushikeshpol02/pm-ai-skills/blob/main/cursor/skills/transcript-to-meeting-notes/SKILL.md) | 把 `.vtt/.docx/.md/.txt` 转录稿整理成结构化会议纪要（决策、待办、开放问题） |
| **meeting-minutes** | [github/awesome-copilot](https://github.com/github/awesome-copilot/blob/main/skills/meeting-minutes/SKILL.md) | 生成简洁可执行的会议纪要（参会人、决策、Action Items） |
| **meeting-minutes-taker** | [daymade/claude-code-skills](https://github.com/daymade/claude-code-skills/blob/main/suites/daymade-docs/meeting-minutes-taker/SKILL.md) | 从原始转录生成高质量纪要，支持多轮审阅、说话人识别、Mermaid 图 |
| **ai-meeting-notes** | [openclaw/skills](https://github.com/openclaw/skills/blob/main/skills/jeffjhunter/ai-meeting-notes/SKILL.md) | 杂乱笔记/转录 → 摘要 + 待办（含负责人、截止日期） |

### 2.2 会议分析 / 会前准备（间接相关）

| Skill | 仓库 | 用途 |
|---|---|---|
| **meeting-insights-analyzer** | [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) | 分析会议转录，提取发言比例、口头禅、沟通风格等 |
| **meeting-briefing** | [anthropics/knowledge-work-plugins](https://agent-skills.md/skills/anthropics/knowledge-work-plugins/meeting-briefing) | 会前简报（背景、议题、决策点、行动项跟踪） |
| **notion-meeting-intelligence** | [makenotion/claude-code-notion-plugin](https://github.com/makenotion/claude-code-notion-plugin) | 从 Notion 拉上下文，生成会前材料和议程 |

### 2.3 其他相关

| Skill | 仓库 | 用途 |
|---|---|---|
| **documenting-meetings** | [Medium 介绍文](https://medium.com/data-science-collective/i-created-a-claude-skill-that-turns-piles-of-messy-documents-media-into-a-structured-report-19e9950f93b2) | 录音 + 笔记 + 图片 → 结构化会议报告 |
| **youtube-transcript** | [tapestry-skills-for-claude-code](https://github.com/michalparkola/tapestry-skills-for-claude-code/tree/main/youtube-transcript) | 拉取 YouTube 字幕并生成摘要 |

### 2.4 Skills 合集仓库

- [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) — 含 meeting 相关 skill 索引
- [spencerpauly/awesome-cursor-skills](https://github.com/spencerpauly/awesome-cursor-skills) — Cursor 专用 skill 合集
- [anthropics/skills](https://github.com/anthropics/skills) — 官方 skill 标准与示例

---

## 3. 与 ScribeAI 的匹配度分析

### 3.1 高度相关（建议优先参考）

#### ① transcript-to-meeting-notes — 匹配度 ★★★★★

| 维度 | 说明 |
|---|---|
| 输入 | 正是 ASR 产出的转录稿（.md/.txt/.vtt 等） |
| 输出 | 结构化会议纪要：决策表、分主题讨论、已知/未知、假设、开放问题、下一步 |
| 与项目关系 | 与 ScribeAI「录音 → 转写 → 整理」完全同路 |

**实用价值**：可直接作为 Gemini 的 system prompt + 输出 Markdown 模板，适合作为默认「会议纪要」模式。

**建议用法**：从 skill 里提取 `templates.md` 的结构，做成 `summaryType: 'meeting-notes'`。

---

#### ② meeting-minutes — 匹配度 ★★★★☆

| 维度 | 说明 |
|---|---|
| 定位 | 60 分钟以内的内部短会 |
| 输出 | 元数据、参会人、议程、**决策**、**Action Items（负责人 + 截止日期）**、跟进事项 |
| 特点 | 结构清晰、体量适中，比 transcript-to-meeting-notes 更轻 |

**实用价值**：最适合作为 ScribeAI 的**第一个可上线版本**——改动小、用户容易理解。

**建议用法**：替换当前那句简单 prompt，作为 `summaryType: 'brief-minutes'`。

**输出结构参考**（来自 skill 的 Strict Minutes Schema）：

1. Metadata（标题、日期、时长、组织者等）
2. Attendance（出席 / 缺席）
3. Agenda（议程列表）
4. Summary（1–3 句概述）
5. Decisions Made（决策 + 理由 + 生效日期）
6. Action Items（负责人 + 截止日期 + 验收标准）
7. Notes by Agenda Item（分议题要点）
8. Parking Lot / Unresolved Items（搁置事项）
9. Risks / Blockers（风险与阻碍）
10. Next Meeting / Follow-up（下次会议）
11. Attachments / References（附件与引用）
12. Version & Change Log（版本记录）

---

#### ③ ai-meeting-notes — 匹配度 ★★★★☆

| 维度 | 说明 |
|---|---|
| 强项 | 从杂乱转录中提取**待办事项**（负责人、截止日期、决策） |
| 弱项 | 文件命名、本地存储、to-do 跟踪——与 ScribeAI 无关 |

**实用价值**：如果用户更关心「会后要做什么」，而不是完整纪要，这个 skill 的**提取规则**很有用。

**建议用法**：单独做一种输出模式 `summaryType: 'action-items'`，或作为会议纪要的第二段 prompt（先出纪要，再抽 action items）。

---

### 3.2 中度相关（第二阶段可参考）

#### ④ meeting-minutes-taker — 匹配度 ★★★☆☆

| 优点 | 高质量纪要、说话人识别、证据引用（原文摘录）、完整性检查清单、多轮审阅 |
| 缺点 | 流程重，适合长会；ScribeAI 目前没有说话人分离 |

**实用价值**：其中的 `meeting_minutes_template.md` 和 `completeness_review_checklist.md` 可用来做**二次润色**（第一遍 Gemini 生成 → 第二遍按清单查漏）。

**建议用法**：长录音（>30 分钟）时启用「高质量模式」，走两轮生成。

---

#### ⑤ documenting-meetings — 匹配度 ★★★☆☆

支持录音 + 文字笔记 + 图片 → 结构化报告。ScribeAI 目前只有转录文本，但未来若支持上传议程、PPT、手写笔记，这个 skill 的多源整合思路值得借鉴。

---

### 3.3 低相关（现阶段不必集成）

| Skill | 原因 |
|---|---|
| meeting-insights-analyzer | 偏行为分析（发言比例、口头禅），不是纪要生成 |
| meeting-briefing | 会前准备，不是会后整理 |
| notion-meeting-intelligence | 依赖 Notion 生态，和当前架构无关 |
| youtube-transcript | 场景不同（视频字幕） |

---

## 4. 推荐集成方案

不必照搬 SKILL.md 整套 Agent 机制，核心是抽取其中的**模板 + 规则**，迁入后端：

```
backend/src/prompts/
├── summary-brief.ts         ← 来自 meeting-minutes（轻量摘要）
├── summary-meeting-notes.ts ← 来自 transcript-to-meeting-notes（完整纪要）
└── summary-action-items.ts  ← 来自 ai-meeting-notes（待办提取）
```

### 4.1 前端摘要模式选择

将「摘要」按钮扩展为模式选择：

| 模式 | 来源 Skill | 适用场景 |
|---|---|---|
| 简要摘要 | meeting-minutes（精简版） | 快速浏览 |
| 会议纪要 | transcript-to-meeting-notes | 正式会议记录 |
| 行动清单 | ai-meeting-notes | 只关心待办 |

### 4.2 API 改造建议

当前接口：`POST /api/transcript/:id/summary`

建议扩展：

```typescript
// 请求体增加 summaryType 参数
{ "summaryType": "brief" | "meeting-notes" | "action-items" }
```

后端根据 `summaryType` 选择对应 prompt 模板，调用 Gemini 生成结果。

### 4.3 数据库

`Summary.text` 继续存 Markdown 即可，**不必改表结构**。若未来需要区分摘要类型，可增加可选字段 `summaryType`。

### 4.4 集成步骤（建议顺序）

1. **第一步**：用 `meeting-minutes` 替换现有单行 prompt，验证输出质量
2. **第二步**：新增 `transcript-to-meeting-notes` 完整纪要模式
3. **第三步**：前端增加摘要类型选择 UI
4. **第四步**：接入 `ai-meeting-notes` 待办提取模式
5. **第五步**（可选）：长会启用 `meeting-minutes-taker` 两轮生成 + 完整性检查

---

## 5. 优先级总结

| 优先级 | Skill | 理由 |
|---|---|---|
| **P0** | [meeting-minutes](https://github.com/github/awesome-copilot/blob/main/skills/meeting-minutes/SKILL.md) | 最轻、最快替换现有 prompt |
| **P0** | [transcript-to-meeting-notes](https://github.com/rushikeshpol02/pm-ai-skills) | 与 ASR 转录稿场景最贴合，结构化程度最高 |
| **P1** | [ai-meeting-notes](https://github.com/openclaw/skills/blob/main/skills/jeffjhunter/ai-meeting-notes/SKILL.md) | 补强待办提取，用户刚需 |
| **P2** | [meeting-minutes-taker](https://github.com/daymade/claude-code-skills) | 长会高质量模式 + 完整性检查 |
| **暂缓** | 其他 | 场景不匹配或依赖外部平台 |

---

## 6. 注意事项

1. **输入质量依赖 ASR**：Skills 假设转录稿基本可读；若 ASR 错误较多，纪要质量会下降，可考虑在 prompt 中加入「标注不确定内容」的规则。
2. **元数据缺失**：ScribeAI 目前不记录会议标题、参会人、议程等，生成时可从转录内容推断，缺失字段标为 `TBD`（meeting-minutes skill 已有此约定）。
3. **说话人分离**：当前无 diarization，涉及「负责人」的 action items 可能只能从上下文推断，需在 prompt 中说明限制。
4. **模型选择**：当前使用 `gemini-2.5-flash`，结构化长输出可考虑在高质量模式下切换更强模型。
5. **缓存策略**：`Summary` 表已有缓存逻辑（存在则直接返回），新增 `summaryType` 后需决定是否按类型分别缓存。

---

## 7. 相关代码位置

| 文件 | 说明 |
|---|---|
| `backend/src/routes/sessions.ts` | 摘要生成接口（当前 prompt 所在处） |
| `backend/prisma/schema.prisma` | `Summary` 数据模型 |
| `frontend/app/(routes)/sessions/page.tsx` | 会话列表与摘要展示 UI |

---

## 8. 后续行动

- [ ] 从 P0 skills 提取 prompt 模板，创建 `backend/src/prompts/` 目录
- [ ] 改造 `POST /:id/summary` 接口，支持 `summaryType` 参数
- [ ] 前端摘要按钮增加模式选择
- [ ] 用真实会议转录稿测试三种模式的输出质量
- [ ] 评估长会场景是否需要 P2 两轮生成方案
