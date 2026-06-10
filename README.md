# 📝 ScribeAI

ScribeAI 是一个现代、**AI 驱动的音频记录与会议转录应用**，支持**麦克风音频**、**标签页音频**录制以及**实时转录**，搭载 **Gemini / OpenAI 兼容 LLM** 与 **Agent Skills 结构化纪要**。它提供简洁的用户界面、强大的录制功能、草稿箱、会话历史记录和 AI 生成的摘要——是学生、职场人士、面试者和远程团队的理想选择。

---

# 🚀 核心功能

## 🎙️ 实时录音与转录

* 麦克风音频录制
* 标签页音频录制（系统音频）
* 通过 Socket.io 实时转录
* 流畅的转录内容展示，支持自动滚动
* 包含所有转录内容的会话管理

## 🧠 AI 摘要生成（Gemini / OpenAI 兼容 + Skills）

* 基于 **transcript-to-meeting-notes** Skill 生成结构化会议纪要
* 决策汇总表、分议题记录、已知/未知分析、待验证假设、开放问题、下一步行动
* 支持两种摘要模式：`meeting-notes`（结构化纪要，默认）、`brief`（简要摘要）
* 按 `summaryType` 分别缓存，支持查看、重新生成与覆盖更新
* LLM 双模式：Gemini 或 OpenAI 兼容接口（DeepSeek、通义千问、One API 网关等）
* 通过 `SUMMARY_PROVIDER` 环境变量一键切换提供商

## 📚 会话管理

* 仪表板中列出历史会话
* 查看完整会话转录
* 列表卡片直接「查看摘要」（显示「已有摘要」标签）
* 转录弹窗内选择摘要模式、生成 / 重新生成 / 查看摘要
* 基于 shadcn/ui 的简洁卡片式界面

## 📄 摘要预览、导出与分享

* 独立预览页 `/sessions/{id}/summary`：Markdown 渲染、打印友好布局
* 工具栏支持导出 **Word**（`.docx`）、**PDF**、浏览器打印、复制分享链接
* 导出文件**不落盘**：每次请求从数据库读取摘要 Markdown，内存中即时转换后返回下载
* 分享链接使用 JWT（`shareToken`），默认 **7 天**有效（`SUMMARY_SHARE_TOKEN_EXPIRES` 可配置）
* 每次点击「复制链接」生成新令牌；旧链接在各自过期前仍有效
* 分享链接免登录可预览、导出；过期后返回 `401`

## 🔐 认证系统

* 登录与注册
* 表单验证
* 会话/JWT 存储于 localStorage

## 🎨 现代化 UI/UX

* 基于 Tailwind + shadcn/ui 构建
* 完全响应式
* 侧边栏导航
* 流畅的排版与动画
* 深色模式支持

---

# 🎥 项目演示

```
https://drive.google.com/file/d/1mDDs-MrjtbcsTMtQ6CqwvGPlGaqI3eyQ/view?usp=sharing
```

---

## 🖼️ 截图

![登录页面](frontend/public/login.png)

![仪表板](frontend/public/dash.png)

![会话页面](frontend/public/session.png)

![摘要页面](frontend/public/Summary.png)

---

# 🧰 技术栈

| 层级                | 技术                                |
| -------------------- | ----------------------------------- |
| **前端**             | Next.js 14（App Router），TypeScript |
| **UI/样式**          | Tailwind CSS，shadcn/ui             |
| **AI**               | Gemini / OpenAI 兼容 LLM，Agent Skills 纪要模板，Deepgram / OpenAI 兼容 ASR |
| **Skills**           | 双层级模板体系（SummarySkill + SummaryTemplate），AI 生成/编辑/预览/导入导出模板 |
| **实时通信**         | Socket.io Client                    |
| **状态管理**         | Zustand                             |
| **录制**             | MediaRecorder API                   |
| **部署**             | Vercel（推荐）                      |

---

# 📁 文件夹结构

```
frontend/
├── app/
│   ├── login/
│   ├── signup/
│   ├── dashboard/
│   ├── sessions/
│   ├── drafts/
│   ├── profile/
│   ├── manager/                     # 管理后台
│   └── settings/summary-templates/  # 个性化纪要模板管理
│       ├── new/                     #   AI 生成模板
│       └── [id]/                    #   编辑/预览/导出模板
│
├── components/
│   ├── audio-mode-selector.tsx
│   ├── recording-controls.tsx
│   ├── transcript-feed.tsx
│   ├── sidebar.tsx
│   ├── navbar.tsx
│   ├── summary-template-select.tsx  # 纪要模板选择器
│   ├── template-select-modal.tsx    # 多模板弹窗选择
│   ├── dashboard-draft-actions.tsx  # 录音页模板+纪要按钮组
│   ├── generate-meeting-summary-button.tsx
│   ├── promote-draft-button.tsx
│   └── draft-restore-banner.tsx
│
├── hooks/
│   ├── use-audio-recorder.ts
│   ├── use-draft-sync.ts
│   └── use-can-promote.ts
│
└── lib/
    ├── socket.ts
    ├── store.ts                     # Zustand 录音状态
    ├── session-storage.ts           # Zustand 会话状态
    ├── summary-templates.ts         # 模板 CRUD API
    ├── resolve-summary-template.ts  # 模板解析规则逻辑
    ├── promote-and-summarize.ts     # 转正+纪要生成
    ├── draft-api.ts
    ├── vad.ts                       # Silero VAD 集成
    ├── app-config.ts
    └── utils.ts

backend/
├── skills/                          # Agent Skill 原文（已迁移至 DB）
│   └── transcript-to-meeting-notes/
├── prisma/
│   └── schema.prisma
└── src/
    ├── index.ts
    ├── prompts/                     # 可执行 prompt 构建
    │   ├── build-summary-prompt.ts   #   传统 prompt 构建（旧版）
    │   ├── summary-meeting-notes.ts  #   system rules + output 常量
    │   ├── summary-brief.ts
    │   └── template-generate-draft.ts # AI 生成模板草稿 prompt
    ├── routes/
    │   ├── authroutes.ts
    │   ├── transcript.ts
    │   ├── sessions.ts
    │   ├── drafts.ts
    │   ├── templates.ts             # 模板 CRUD + fork + preview + export/import
    │   └── downloads.ts
    ├── middleware/
    │   ├── authMiddleware.ts
    │   └── managerMiddleware.ts
    ├── lib/
    │   ├── prisma.ts
    │   ├── summary-llm.ts           # LLM 调用统一入口
    │   ├── summary-template-service.ts  # 模板解析/服务
    │   ├── summary-template-seed.ts     # 系统模板种子数据
    │   ├── summary-template-constants.ts# 系统模板 ID 常量
    │   ├── summary-prompt-builder.ts    # 模板→LLM prompt 构建
    │   ├── summary-export-docx.ts
    │   ├── summary-export-pdf.ts
    │   ├── summary-share-token.ts
    │   └── openai-api-url.ts
    └── socket/
        └── socket.ts
```

---

# 🎙️ 录音系统

一个支持麦克风和标签页音频的模块化录音引擎。

### 🔊 音频模式选择器

* 使用 `getUserMedia()` 录制麦克风音频
* 使用 `getDisplayMedia()` 录制标签页音频
* 优雅处理权限错误

### ⏺️ 录音控制

* 开始
* 暂停
* 恢复
* 停止
* 实时状态指示器

### 🔄 流式传输逻辑

* MediaRecorder 每 1-2 秒切片音频
* 通过 Socket.io 发送到后端：

```
socket.emit("audio-chunk", blob)
```

* 转录内容实时更新

### 🧠 语音活动检测（VAD）

* 基于 Silero VAD 模型（@ricky0123/vad-web）的浏览器端语音检测
* ONNX Runtime Web WASM 在浏览器本地运行模型
* 检测到语音开始/结束时，通知后端按语义边界发送 ASR 请求
* 后端根据 VAD 段号（seq）重排序，保证文字顺序正确
* 兜底安全定时器（10 秒），VAD 异常时自动刷新
* VAD 状态在界面实时显示（就绪/加载中/不可用）

### 📝 草稿箱机制

* 录音过程中自动创建草稿，实时保存转录内容（防抖写入 + 离开页面刷盘）
* 停止录音后，可在「实时转录」面板中查看草稿
* 点击「保存为正式会话」将草稿转为永久会话
* 草稿箱页面可查看、恢复、继续录音或删除草稿

### 🔒 屏幕唤醒锁（Wake Lock）

* 开始录音时通过 [Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) 请求 `screen` 唤醒锁，**防止录音过程中屏幕自动熄灭**
* 点击「停止」、组件卸载（如切页离开 Dashboard）时主动释放唤醒锁
* 页面从后台回到前台且仍在录音时，自动尝试重新获取唤醒锁
* 浏览器不支持或未授权时静默降级，不影响录音流程
* **说明**：唤醒锁仅防止锁屏，无法阻止用户切换到其他 App；切到其他 App 时录音行为取决于浏览器与系统策略

### 📋 Agent Skills 个性化纪要模板

每用户可拥有自己的纪要模板库，系统内置模板可 fork 为个人副本，无限制自定义版式。

#### 双层级模板体系

```
SummarySkill（定义规则 + 步骤 + 输出结构）
    └── SummaryTemplate（用户可见的模板实例，引用一个 Skill）
            └── Summary（每次生成的纪要结果，记录 templateId + version）
```

- **SummarySkill**：`rulesMd`（整理规则）+ `stepsMd`（工作流步骤）+ `outputMd`（输出版式），可 fork 衍生
- **SummaryTemplate**：用户面对的具体模板，关联一个 Skill，可设默认、提交公共、导入/导出
- **Summary**：纪要生成结果，缓存时按 `(transcriptId, templateId)` 去重，互不干扰

#### 模板解析层级（按优先级）

```
用户指定 templateId → legacy summaryType（meeting-notes/brief）→ 用户默认模板 → 系统默认模板
```

#### 核心功能

- **Fork（复制系统模板）**：从系统模板或他人共享模板复制为自己的副本，编辑 rules/steps/output
- **AI 生成模板**：输入文字描述或粘贴范例纪要，AI 自动生成模板草稿，可修改后保存
- **预览**：保存前用样例文本试跑 LLM，预览效果
- **导入/导出**：`.skill.json` 格式，跨实例迁移
- **公开共享**：用户可将模板提交公开审核，管理员审核后成为公共模板
- **多模板选择**：有 2+ 自定义模板时，生成纪要前弹出选择对话框

#### 前端页面

| 路由 | 说明 |
|------|------|
| `/settings/summary-templates` | 模板列表，分类展示系统模板与我的模板 |
| `/settings/summary-templates/new` | AI 生成新模板（描述需求或贴范例） |
| `/settings/summary-templates/[id]` | 编辑/预览/导出/设为默认/申请公开 |

#### API 端点

| 方法 | 端点 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/templates` | Bearer | 列出系统 + 我的 + 已审核公共模板 |
| POST | `/api/templates` | Bearer | 从草稿创建用户模板 |
| POST | `/api/templates/generate-draft` | Bearer | AI 根据描述生成模板草稿 |
| POST | `/api/templates/import` | Bearer | 导入 `.skill.json` |
| GET | `/api/templates/:id` | Bearer | 查看模板详情（含 Skill） |
| PUT | `/api/templates/:id` | Bearer | 编辑模板名称/描述/rules/steps/output |
| DELETE | `/api/templates/:id` | Bearer | 删除模板（需无引用） |
| POST | `/api/templates/:id/fork` | Bearer | 复制为我的模板 |
| POST | `/api/templates/:id/default` | Bearer | 设为默认（非自有时自动 fork） |
| POST | `/api/templates/:id/preview` | Bearer | 试跑 LLM 预览效果 |
| GET | `/api/templates/:id/export` | Bearer | 导出 `.skill.json` |
| POST | `/api/templates/:id/submit-public` | Bearer | 提交公共审核 |

#### 摘要生成 API

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/sessions/:id/summary` | 生成摘要，请求体 `{ "templateId"?: string, "regenerate"?: boolean }` |

- 省略 `templateId` 时按「模板解析层级」自动选择模板
- `regenerate: true` 时覆盖同模板已缓存摘要
- 结构化生成通常需 1–3 分钟

### 📄 摘要预览 / 导出 / 分享 API

| 方法 | 端点 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/sessions/:id/summary/preview` | Bearer 或 `?shareToken=` | 预览页 JSON 数据 |
| GET | `/api/sessions/:id/summary/export?format=docx\|pdf` | Bearer 或 `?shareToken=` | 即时生成并下载 Word/PDF |
| POST | `/api/sessions/:id/summary/share-link` | Bearer | 生成分享令牌与预览/导出路径 |

预览页路由：`/sessions/{id}/summary?summaryType=meeting-notes&shareToken=...`

---

# 📦 环境变量

后端 `backend/.env`：

```
# 数据库 (PostgreSQL 或 MySQL)
DATABASE_URL=your-db-url

# JWT 密钥
JWT_SECRET=your_jwt_secret

# 摘要分享链接有效期（jsonwebtoken expiresIn 格式，如 7d、24h、30m）
SUMMARY_SHARE_TOKEN_EXPIRES=7d

# Deepgram 实时语音转文字 API
DEEPGRAM_API_KEY=deepgram-key

# 摘要 LLM 提供商: gemini | openai_compatible
SUMMARY_PROVIDER=gemini

# --- Gemini 配置（SUMMARY_PROVIDER=gemini 时使用）---
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-2.5-flash

# --- OpenAI 兼容配置（SUMMARY_PROVIDER=openai_compatible 时使用）---
# BASE_URL 按提供商文档填写，不会自动补 /v1；代码在其后拼接 chat/completions
OPENAI_LLM_API_KEY=sk-xxx
OPENAI_LLM_BASE_URL=https://api.deepseek.com/v1
OPENAI_LLM_MODEL=deepseek-chat
# OPENAI_LLM_COMPLETIONS_PATH=chat/completions
OPENAI_LLM_MAX_TOKENS=4096
OPENAI_LLM_TEMPERATURE=0.3

# STT 引擎选择: "deepgram" (默认, 实时流式) 或 "openai_asr" (定时切片伪流式)
STT_PROVIDER=deepgram

# OpenAI 兼容 ASR 配置 (STT_PROVIDER=openai_asr 时使用)
OPENAI_ASR_API_KEY=your-api-key
OPENAI_ASR_BASE_URL=http://your-server:8000/v1
OPENAI_ASR_MODEL=funasr-nano
OPENAI_ASR_LANGUAGE=zh

# 伪流式切片间隔 (秒)，每 N 秒发送一段音频进行转写 (VAD 禁用时生效)
ASR_SLICE_INTERVAL=5

# VAD 配置（Silero VAD 模型参数，后端通过 Socket 下发给前端）
VAD_ENABLED=true
VAD_MODEL=v5
VAD_PROB_THRESHOLD=0.5
VAD_NEGATIVE_THRESHOLD=0.35
VAD_REDEMPTION_MS=1400
VAD_PRE_SPEECH_PAD_MS=800
VAD_MIN_SPEECH_MS=400

# 长耗时 HTTP 请求超时（毫秒，结构化摘要 LLM 生成）
HTTP_LONG_REQUEST_MS=300000
SUMMARY_ROUTE_TIMEOUT_MS=300000

# PDF 导出中文字体（可选；默认使用 backend/assets/fonts/NotoSansSC-Regular.otf）
# PDF_FONT_PATH=/path/to/NotoSansSC-Regular.otf
```

前端 `frontend/next.config.ts` 开发代理：

```
experimental.proxyTimeout: 300_000   # rewrites 代理后端 API，默认 30s 会导致摘要 ECONNRESET
```

---

# 🧪 脚本

### 🖥️ 前端配置

```
cd frontend
npm install

# 开发
npm run dev

# 生产：编译后启动
npm run build    # 编译 Next.js 应用
npm start        # 启动生产服务器

# 代码检查（可选）
npm run lint
```

### 🖥️ 后端配置

```
cd backend
npm install

# 初始化数据库（需先配置好 DATABASE_URL）
npx prisma generate      # 生成 Prisma Client
npx prisma db push       # 同步数据库表结构（开发环境快速建表）

# 数据库迁移（有新的迁移文件时执行，生产环境推荐）
npx prisma migrate deploy    # 应用所有未执行的迁移

# 启动方式一：编译后启动（生产）
npm run build            # prisma generate + tsc + 复制 generated 到 dist
npm start                # 启动服务

# 启动方式二：直接运行（开发）
npx ts-node src/index.ts

# 测试摘要 prompt 构建（不调用 LLM）
npx ts-node scripts/test-summary-prompt.ts

# 测试真实 LLM 摘要生成
npx ts-node scripts/test-summary-prompt.ts --llm
```

---

## 📄 许可证

MIT
