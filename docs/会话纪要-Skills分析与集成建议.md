# ScribeAI 会话纪要 Skills 分析与集成建议

> 文档日期：2026-06-09  
> 最后更新：2026-06-09（对照 OpenAI 兼容摘要、草稿箱、摘要 UI、录音生命周期等现有功能修订）  
> 用途：记录 GitHub 上与会话记录/会议纪要相关的 Agent Skills 调研结果，以及针对 ScribeAI 产品集成的优先级与实施方案，供后续开发参考。

---

## 1. 背景与目标

### 1.1 当前产品链路（2026-06 现状）

```
录音（Dashboard）
  → VAD 分段 + Socket 实时 ASR（Deepgram 或 OpenAI 兼容 ASR）
  → 转录写入 Zustand + 草稿自动保存（Draft 表）
  → 用户「保存为正式会话」（promote）→ Transcript 表
  → 用户在会话记录页点击「生成摘要」
  → LLM 生成（Gemini 或 OpenAI 兼容）→ Summary 表缓存
  → 列表/弹窗查看摘要
```

与初版文档相比，链路多了**草稿中间态**和**LLM 提供商抽象**，摘要仍是最薄弱的一环（prompt 极简、无结构化模式）。

### 1.2 摘要现状

摘要生成已抽象到 `backend/src/lib/summary-llm.ts`，路由层只负责取 `fullText` 并调用 `generateSummary()`：

```typescript
// backend/src/routes/sessions.ts
const prompt = `Summarize the following transcript with all important key points:\n\n${transcript.fullText}`;
const generatedSummary = await generateSummary(prompt);
```

LLM 提供商通过环境变量切换（**与具体 Skill 模板正交**，Skills 集成只需改 prompt 构建逻辑）：

| `SUMMARY_PROVIDER` | 配置项 | 说明 |
|---|---|---|
| `gemini`（默认） | `GEMINI_API_KEY`、`GEMINI_MODEL` | 海外或有代理环境 |
| `openai_compatible` | `OPENAI_LLM_API_KEY`、`OPENAI_LLM_BASE_URL`、`OPENAI_LLM_MODEL` 等 | 大陆可用 DeepSeek、通义、One API 网关等 |

**问题（未变）**：转录与草稿能力已有，但「整理成结构化会话纪要」这一步几乎没有设计；README 中写的决策/待办/风险等能力**尚未在 prompt 中实现**。

**Skills 的价值**：GitHub 上的 Agent Skills（`SKILL.md` 格式）提供了成熟的**输出模板、信息提取规则和 prompt 范式**。这些资源应迁入后端的 **prompt 模块**，经 `generateSummary()` 统一调用，**而不是**安装到 Cursor IDE 中使用。

---

## 2. 自初版文档以来的项目变化（集成前提）

实施 Skills 前需了解的现状，避免按旧架构设计：

| 变化 | 说明 | 对 Skills 集成的影响 |
|---|---|---|
| **LLM 双模式** | `summary-llm.ts` 抽象 Gemini / OpenAI 兼容 Chat Completions | Prompt 模板与提供商无关，同一套 Skills 模板两种模式都能用 |
| **ASR 双模式** | `STT_PROVIDER=deepgram \| openai_asr` | 纪要质量依赖 ASR 输出；OpenAI 兼容 ASR + VAD 分段已是国内主路径 |
| **草稿箱** | `Draft` 表 + 自动保存 + promote 转正 | 摘要入口仍在**正式 Transcript**；草稿阶段暂无摘要（可列为 P2 增强） |
| **摘要 UI** | 列表「已有摘要」标签；卡片「查看摘要」；转录弹窗「生成摘要」 | 未来加 `summaryType` 时需扩展 UI（模式选择 + 按类型展示/缓存） |
| **录音切页** | 离开 Dashboard 时 `finalizeActiveRecording()` 完整停止并通知后端 | 长会转录更完整，有利于长纪要生成；与 Skills 无直接耦合 |
| **API 路径** | 摘要接口为 `POST /api/sessions/:id/summary`（非 `/api/transcript/...`） | 扩展请求体时改 sessions 路由即可 |

---

## 3. GitHub 相关 Skills 一览

### 3.1 转录 → 会议纪要（直接相关）

| Skill | 仓库 | 用途 |
|---|---|---|
| **transcript-to-meeting-notes** | [rushikeshpol02/pm-ai-skills](https://github.com/rushikeshpol02/pm-ai-skills/blob/main/cursor/skills/transcript-to-meeting-notes/SKILL.md) | 把 `.vtt/.docx/.md/.txt` 转录稿整理成结构化会议纪要（决策、待办、开放问题） |
| **meeting-minutes** | [github/awesome-copilot](https://github.com/github/awesome-copilot/blob/main/skills/meeting-minutes/SKILL.md) | 生成简洁可执行的会议纪要（参会人、决策、Action Items） |
| **meeting-minutes-taker** | [daymade/claude-code-skills](https://github.com/daymade/claude-code-skills/blob/main/suites/daymade-docs/meeting-minutes-taker/SKILL.md) | 从原始转录生成高质量纪要，支持多轮审阅、说话人识别、Mermaid 图 |
| **ai-meeting-notes** | [openclaw/skills](https://github.com/openclaw/skills/blob/main/skills/jeffjhunter/ai-meeting-notes/SKILL.md) | 杂乱笔记/转录 → 摘要 + 待办（含负责人、截止日期） |

### 3.2 会议分析 / 会前准备（间接相关）

| Skill | 仓库 | 用途 |
|---|---|---|
| **meeting-insights-analyzer** | [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) | 分析会议转录，提取发言比例、口头禅、沟通风格等 |
| **meeting-briefing** | [anthropics/knowledge-work-plugins](https://agent-skills.md/skills/anthropics/knowledge-work-plugins/meeting-briefing) | 会前简报（背景、议题、决策点、行动项跟踪） |
| **notion-meeting-intelligence** | [makenotion/claude-code-notion-plugin](https://github.com/makenotion/claude-code-notion-plugin) | 从 Notion 拉上下文，生成会前材料和议程 |

### 3.3 其他相关

| Skill | 仓库 | 用途 |
|---|---|---|
| **documenting-meetings** | [Medium 介绍文](https://medium.com/data-science-collective/i-created-a-claude-skill-that-turns-piles-of-messy-documents-media-into-a-structured-report-19e9950f93b2) | 录音 + 笔记 + 图片 → 结构化会议报告 |
| **youtube-transcript** | [tapestry-skills-for-claude-code](https://github.com/michalparkola/tapestry-skills-for-claude-code/tree/main/youtube-transcript) | 拉取 YouTube 字幕并生成摘要 |

### 3.4 Skills 合集仓库

- [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) — 含 meeting 相关 skill 索引
- [spencerpauly/awesome-cursor-skills](https://github.com/spencerpauly/awesome-cursor-skills) — Cursor 专用 skill 合集
- [anthropics/skills](https://github.com/anthropics/skills) — 官方 skill 标准与示例

---

## 4. 与 ScribeAI 的匹配度分析

### 4.1 高度相关（建议优先参考）

#### ① transcript-to-meeting-notes — 匹配度 ★★★★★

| 维度 | 说明 |
|---|---|
| 输入 | 正是 ASR 产出的转录稿（.md/.txt/.vtt 等） |
| 输出 | 结构化会议纪要：决策表、分主题讨论、已知/未知、假设、开放问题、下一步 |
| 与项目关系 | 与 ScribeAI「录音 → 转写 → 整理」完全同路 |

**实用价值**：可直接作为 LLM 的 system prompt + 输出 Markdown 模板，适合作为默认「会议纪要」模式。

**建议用法**：从 skill 里提取 `templates.md` 的结构，做成 `summaryType: 'meeting-notes'`。

---

#### ② meeting-minutes — 匹配度 ★★★★☆

| 维度 | 说明 |
|---|---|
| 定位 | 60 分钟以内的内部短会 |
| 输出 | 元数据、参会人、议程、**决策**、**Action Items（负责人 + 截止日期）**、跟进事项 |
| 特点 | 结构清晰、体量适中，比 transcript-to-meeting-notes 更轻 |

**实用价值**：最适合作为 ScribeAI 的**第一个可上线版本**——改动小、用户容易理解。

**建议用法**：替换当前单行 prompt，作为 `summaryType: 'brief-minutes'`。

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

### 4.2 中度相关（第二阶段可参考）

#### ④ meeting-minutes-taker — 匹配度 ★★★☆☆

| 优点 | 高质量纪要、说话人识别、证据引用（原文摘录）、完整性检查清单、多轮审阅 |
| 缺点 | 流程重，适合长会；ScribeAI 目前没有说话人分离 |

**实用价值**：其中的 `meeting_minutes_template.md` 和 `completeness_review_checklist.md` 可用来做**二次润色**（第一遍 LLM 生成 → 第二遍按清单查漏）。

**建议用法**：长录音（>30 分钟）时启用「高质量模式」，走两轮生成。国内环境可用 `OPENAI_LLM_MODEL` 指向更强模型。

---

#### ⑤ documenting-meetings — 匹配度 ★★★☆☆

支持录音 + 文字笔记 + 图片 → 结构化报告。ScribeAI 目前只有转录文本，但未来若支持上传议程、PPT、手写笔记，这个 skill 的多源整合思路值得借鉴。

---

### 4.3 低相关（现阶段不必集成）

| Skill | 原因 |
|---|---|
| meeting-insights-analyzer | 偏行为分析（发言比例、口头禅），不是纪要生成 |
| meeting-briefing | 会前准备，不是会后整理 |
| notion-meeting-intelligence | 依赖 Notion 生态，和当前架构无关 |
| youtube-transcript | 场景不同（视频字幕） |

---

## 5. 推荐集成方案

不必照搬 SKILL.md 整套 Agent 机制，核心是抽取其中的**模板 + 规则**，迁入后端 prompt 层，经现有 `generateSummary()` 调用（**提供商无关**）：

```
backend/src/
├── lib/
│   └── summary-llm.ts          ← 已有：generateSummary(prompt)，勿在此写业务 prompt
└── prompts/
    ├── build-summary-prompt.ts ← 新增：按 summaryType 组装最终 prompt
    ├── summary-brief.ts        ← 来自 meeting-minutes（轻量摘要）
    ├── summary-meeting-notes.ts← 来自 transcript-to-meeting-notes（完整纪要）
    └── summary-action-items.ts ← 来自 ai-meeting-notes（待办提取）
```

`sessions.ts` 中改为：

```typescript
import { buildSummaryPrompt } from '../prompts/build-summary-prompt';

const summaryType = req.body?.summaryType ?? 'brief';
const prompt = buildSummaryPrompt(summaryType, transcript.fullText, {
  title: transcript.title,
  createdAt: transcript.createdAt,
});
const generatedSummary = await generateSummary(prompt);
```

### 5.1 前端摘要模式选择

在会话记录页扩展「生成摘要」为模式选择（生成前选择；已缓存则直接查看）：

| 模式 | 来源 Skill | 适用场景 |
|---|---|---|
| 简要摘要 | meeting-minutes（精简版） | 快速浏览 |
| 会议纪要 | transcript-to-meeting-notes | 正式会议记录 |
| 行动清单 | ai-meeting-notes | 只关心待办 |

当前 UI 已有列表「查看摘要」、卡片 `hasSummary` 标签，扩展时可在生成弹窗中加模式单选。

### 5.2 API 改造建议

当前接口：`POST /api/sessions/:id/summary`

建议扩展请求体：

```typescript
{ "summaryType": "brief" | "meeting-notes" | "action-items" }
```

后端根据 `summaryType` 选择 prompt 模板，调用 `generateSummary()`（自动走 Gemini 或 OpenAI 兼容）。

列表接口 `GET /api/sessions` 已返回 `hasSummary: boolean`，扩展类型后可增加 `summaryType` 字段（需改表或 JSON 元数据）。

### 5.3 数据库

`Summary.text` 继续存 Markdown 即可。若支持多种摘要类型，**需要**扩展模型（当前 Transcript ↔ Summary 为 1:1 唯一约束）：

```prisma
model Summary {
  // 可选新增
  summaryType String @default("brief")
}
```

或改为同一 Transcript 允许多条 Summary（`@@unique([transcriptId, summaryType])`），按类型分别缓存。

### 5.4 集成步骤（建议顺序）

1. **第一步**：新增 `prompts/`，用 `meeting-minutes` 替换单行 prompt，在现有 `SUMMARY_PROVIDER` 下验证输出质量（Gemini + OpenAI 兼容各测一次）
2. **第二步**：新增 `transcript-to-meeting-notes` 完整纪要模式
3. **第三步**：前端生成摘要时增加模式选择 UI
4. **第四步**：接入 `ai-meeting-notes` 待办提取模式；扩展 `Summary` 缓存策略
5. **第五步**（可选）：长会启用 `meeting-minutes-taker` 两轮生成 + 完整性检查
6. **第六步**（可选）：草稿 promote 前预览纪要，或草稿箱直接生成摘要（需新 API）

---

## 6. 优先级总结

| 优先级 | Skill | 理由 |
|---|---|---|
| **P0** | [meeting-minutes](https://github.com/github/awesome-copilot/blob/main/skills/meeting-minutes/SKILL.md) | 最轻、最快替换现有 prompt |
| **P0** | [transcript-to-meeting-notes](https://github.com/rushikeshpol02/pm-ai-skills) | 与 ASR 转录稿场景最贴合，结构化程度最高 |
| **P1** | [ai-meeting-notes](https://github.com/openclaw/skills/blob/main/skills/jeffjhunter/ai-meeting-notes/SKILL.md) | 补强待办提取，用户刚需 |
| **P2** | [meeting-minutes-taker](https://github.com/daymade/claude-code-skills) | 长会高质量模式 + 完整性检查 |
| **P2** | 草稿箱摘要 | 转正前预览纪要，提升草稿价值 |
| **暂缓** | 其他 | 场景不匹配或依赖外部平台 |

---

## 7. 注意事项

1. **输入质量依赖 ASR**：Skills 假设转录稿基本可读；项目已支持 Deepgram 与 OpenAI 兼容 ASR + VAD，国内以后者为主。若 ASR 错误较多，纪要质量会下降，可在 prompt 中加入「标注不确定内容」规则。
2. **元数据缺失**：不记录会议参会人、议程等，生成时可从转录推断，缺失字段标为 `TBD`（meeting-minutes skill 已有此约定）。可用 `transcript.title`、`createdAt` 填入 Metadata 部分。
3. **说话人分离**：当前无 diarization，涉及「负责人」的 action items 可能只能从上下文推断，需在 prompt 中说明限制。
4. **模型选择（已可配置）**：
   - Gemini：`GEMINI_MODEL`（默认 `gemini-2.5-flash`）
   - OpenAI 兼容：`OPENAI_LLM_MODEL`、`OPENAI_LLM_MAX_TOKENS` 等
   - 结构化长输出 / 两轮生成：建议在高质量模式换更强模型，与 `SUMMARY_PROVIDER` 独立配置
5. **缓存策略**：`Summary` 表已有缓存（存在则直接返回）。新增 `summaryType` 后须决定：一种类型覆盖全部，还是按类型分别存储（推荐后者）。
6. **长文本**：超长转录可能触及上下文上限；Skills 集成时需考虑截断、分段摘要再合并，或依赖模型的 `MAX_TOKENS` 配置。
7. **产品描述与实现差距**：README 已描述结构化纪要能力，但代码仍为单行 prompt；Skills 集成后应同步更新 README 与本文档。

---

## 8. 相关代码位置

| 文件 | 说明 |
|---|---|
| `backend/src/lib/summary-llm.ts` | LLM 抽象层：`generateSummary()`，Gemini / OpenAI 兼容 |
| `backend/src/lib/openai-api-url.ts` | OpenAI 兼容 endpoint 拼接 |
| `backend/src/routes/sessions.ts` | `POST /:id/summary` 摘要生成与缓存 |
| `backend/src/prompts/` | `buildSummaryPrompt()`、`summary-meeting-notes.ts`（transcript-to-meeting-notes） |
| `backend/skills/transcript-to-meeting-notes/` | 本地保存的 SKILL.md + templates.md（随仓库提交） |
| `backend/prisma/schema.prisma` | `Transcript`、`Summary`（按 `summaryType` 多类型）、`Draft` |
| `backend/src/routes/drafts.ts` | 草稿 CRUD + promote 转正 |
| `frontend/app/(routes)/sessions/page.tsx` | 会话列表、`hasSummary`、查看/生成摘要 UI |
| `frontend/hooks/use-draft-sync.ts` | 录音转录自动保存草稿 |
| `frontend/hooks/use-audio-recorder.ts` | 录音生命周期（含切页完整停止） |

---

## 9. 后续行动

- [x] LLM 双模式抽象（`summary-llm.ts` + `SUMMARY_PROVIDER`）
- [x] 摘要持久化与列表查看（`Summary` 表 + 会话页 UI）
- [x] 草稿自动保存与转正链路（promote 后才有正式 Transcript）
- [x] 保存 transcript-to-meeting-notes 至 `backend/skills/transcript-to-meeting-notes/`
- [x] 从 skill 提取 prompt 模板，创建 `backend/src/prompts/` 目录
- [x] 新增 `buildSummaryPrompt()`，改造 `POST /api/sessions/:id/summary` 支持 `summaryType`
- [x] 扩展 `Summary` 模型（`@@unique([transcriptId, summaryType])`）
- [x] 前端「生成摘要」增加模式选择（会议纪要 / 简要摘要）
- [x] `openai_compatible` 下样例转录 LLM 测试通过（`scripts/test-summary-prompt.ts --llm`）
- [ ] 在真实会话转录上验收会议纪要质量
- [ ] `SUMMARY_PROVIDER=gemini` 环境对比测试
- [ ] 评估长会场景是否需要 P2 两轮生成方案
- [ ] （可选）草稿箱生成摘要 / promote 前预览
