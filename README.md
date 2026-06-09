# 📝 ScribeAI

ScribeAI 是一个现代、**AI 驱动的音频记录与会议转录应用**，支持**麦克风音频**、**标签页音频**录制以及**实时转录**，搭载 **Gemini AI**。它提供简洁的用户界面、强大的录制功能、会话历史记录和 AI 生成的摘要——是学生、职场人士、面试者和远程团队的理想选择。

---

# 🚀 核心功能

## 🎙️ 实时录音与转录

* 麦克风音频录制
* 标签页音频录制（系统音频）
* 通过 Socket.io 实时转录
* 流畅的转录内容展示，支持自动滚动
* 包含所有转录内容的会话管理

## 🧠 AI 摘要生成（Gemini）

* 生成结构化的会议摘要
* 关键要点
* 决策记录
* 带有负责人的待办事项
* 风险与后续跟进

## 📚 会话管理

* 仪表板中列出历史会话
* 查看完整会话转录
* 查看 AI 摘要
* 基于 shadcn/ui 的简洁卡片式界面

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
| **AI**               | Gemini，Deepgram 语音转文字 API     |
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
│   └── profile/
│
├── components/
│   ├── audio-mode-selector.tsx
│   ├── recording-controls.tsx
│   ├── transcript-feed.tsx
│   ├── sidebar.tsx
│   └── navbar.tsx
│
├── hooks/
│   └── use-audio-recorder.ts
│
└── lib/
    ├── socket.ts
    ├── utils.ts
    ├── store.ts
    ├── app-config.ts
    ├── draft-api.ts
    └── vad.ts (Silero VAD integration)

backend/
├── prisma/
│   └── schema.prisma
└── src/
    ├── index.ts
    ├── routes/
    │   ├── authroutes.ts
    │   ├── transcript.ts
    │   └── sessions.ts
    ├── middleware/
    │   └── authMiddleware.ts
    ├── lib/
    │   └── prisma.ts
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

* 录音过程中自动创建草稿，实时保存转录内容
* 停止录音后，可在"实时转录"面板中查看草稿
* 点击"保存为正式会话"将草稿转为永久会话
* 草稿仅在当前页面有效，刷新或关闭页面后丢弃

---

# 📦 环境变量

后端 `backend/.env`：

```
# 数据库 (PostgreSQL 或 MySQL)
DATABASE_URL=your-db-url

# JWT 密钥
JWT_SECRET=your_jwt_secret

# Deepgram 实时语音转文字 API
DEEPGRAM_API_KEY=deepgram-key

# 摘要 LLM 提供商: gemini | openai_compatible
SUMMARY_PROVIDER=openai_compatible

# Gemini AI 摘要（SUMMARY_PROVIDER=gemini 时使用）
GEMINI_API_KEY=key
GEMINI_MODEL=gemini-2.5-flash
GEMINI_API_URL=url

# OpenAI 兼容摘要（SUMMARY_PROVIDER=openai_compatible 时使用）
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

# VAD 配置（Silero VAD 模型参数）
VAD_ENABLED=true
VAD_PROB_THRESHOLD=0.5
VAD_NEGATIVE_THRESHOLD=0.35
VAD_REDEMPTION_FRAMES=35
VAD_FRAME_SAMPLES=1536
VAD_PRE_SPEECH_PAD_FRAMES=20
VAD_MIN_SPEECH_FRAMES=5
VAD_MODEL=v5
```

---

# 🧪 脚本

### 🖥️ 前端配置

```
cd frontend
npm install
npm run dev
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
npx tsc                  # 编译 TypeScript
npm start                # 启动服务

# 启动方式二：直接运行（开发）
npx ts-node src/index.ts
```

---

## 📄 许可证

MIT
