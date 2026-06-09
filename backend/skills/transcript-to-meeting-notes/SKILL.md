---
name: transcript-to-meeting-notes
description: "Converts meeting transcripts (.vtt, .docx, .md, .txt) into structured meeting summaries. Uses a single unified template for all meeting types (discovery, engineering, technical). Outputs a Discovery Summary with decisions table, topic-by-topic findings with traceability, know/don't-know analysis, assumptions, open questions, and next steps. Topic internal structure adapts based on meeting type. Use when given a transcript file or asked to summarize a meeting, call, sync, or session."
source: rushikeshpol02/ai-skills (local copy, see SOURCE.md)
---

# Transcript to Meeting Notes

将会议转录稿（.vtt / .docx / .md / .txt / 纯文本）整理为**结构化会议纪要**（Discovery / Meeting Summary）。

## 何时使用

- 用户提供转录文件或粘贴转录文本
- 用户要求「整理会议纪要」「discovery summary」「会议摘要」

## 输出语言

- 默认使用**中文**输出（除非转录主要为英文且用户要求英文）
- 保留关键术语原文时可中英并列

## 处理步骤

### Step 1: 阅读并分析转录

- 识别会议类型：discovery / engineering / technical / 一般同步会
- 划分主要议题（Topic）
- 标注决策、待办、开放问题、假设
- **不要编造**：转录未提及的内容标为「未知 / TBD」
- ASR 转录可能有错误，不确定处标注「待确认」

### Step 2: 按 templates.md 生成文档

严格遵循 [templates.md](./templates.md) 的章节顺序与格式。

### Step 3: 必填章节

1. **会议元数据** — 标题、日期、时长（可估）、类型
2. **Decisions Made 决策表** — 顶层汇总；无决策时写「本次会议未达成正式决策」
3. **Topics 分议题记录** — 每个主要议题一节，含要点与可追溯引用（转录摘录）
4. **What We Know vs What We Don't Know** — 按议题对比已知/未知与信心等级
5. **Assumptions That Need Validation** — 仅列若错误会影响设计或决策的假设
6. **Open Questions** — 按 🔴 HIGH / 🟡 MEDIUM / 🟢 LOWER 分组
7. **Agreed Next Steps** — Owner | Action | Due | Trace 表格

### Step 4: 议题内部结构（按会议类型）

#### Discovery

- 背景与目标
- 用户/业务发现
- 约束与依赖
- 初步方案方向

#### Engineering / Technical

- 现状与问题
- 方案讨论（✅ 采纳 / ❌ 拒绝 / ⏸️ 延后）
- 技术风险
- Key Technical Insights（非显而易见的技术结论）

#### 一般同步会

- 进展更新
- 阻塞项
- 需协调事项

## 质量规则

- 决策与待办**单独成章**，不要埋在讨论段落里
- 每个 Action Item 必须有负责人（无法推断则标 TBD）
- 引用转录时使用 `> "摘录"` 格式
- 缺失字段（参会人、议程等）标 TBD，不要猜测
- 无说话人分离时，负责人从上下文推断并注明「推断」

## 输出文件名（供参考）

`[Feature]_Meeting_Summary_[YYYYMMDD].md`
