# CLAUDE.md

此文件为 Claude Code (claude.ai/code) 在此仓库中工作提供指导。

## 项目概述

ScribeAI 是一个 AI 驱动的音频记录与会议转录应用，支持麦克风/标签页音频录制、实时转录（Deepgram）和 AI 摘要生成（Gemini）。采用前后端分离架构。

## 常用命令

### 前端 (Next.js 16 + React 19 + TypeScript)

```bash
cd frontend
npm run dev          # 启动开发服务器 (Next.js)
npm run build        # 生产构建
npm start            # 启动生产服务器
npm run lint         # ESLint 检查
```

### 后端 (Express 5 + TypeScript)

```bash
cd backend
npm start            # 启动生产服务器 (node dist/index.js)
npx ts-node src/index.ts  # 开发时直接运行 TS (需确保依赖已安装)
```

> **注意**: 后端 package.json 没有 `dev` 或 `build` 脚本。TypeScript 编译需手动执行 `npx tsc`。

### 环境变量

在项目根目录创建 `.env.local`，后端需 `.env`：

```
DEEPGRAM_API_KEY=deepgram-key
DATABASE_URL=postgresql://...
JWT_SECRET=your_jwt_secret
SUMMARY_PROVIDER=gemini
GEMINI_API_KEY=gemini-key
GEMINI_MODEL=gemini-2.5-flash
GEMINI_API_URL=gemini-url
OPENAI_LLM_API_KEY=sk-xxx
OPENAI_LLM_BASE_URL=https://api.deepseek.com/v1
OPENAI_LLM_MODEL=deepseek-chat
OPENAI_LLM_MAX_TOKENS=4096
OPENAI_LLM_TEMPERATURE=0.3
```

### 测试

项目中**没有配置测试框架**，无测试文件。

## 代码架构

### 目录结构

```
ScribeAI/
├── frontend/                 # Next.js 16 App Router
│   ├── app/
│   │   ├── layout.tsx        # 根布局: ThemeProvider + Inter 字体
│   │   ├── page.tsx          # 重定向到 /login
│   │   ├── globals.css       # Tailwind v4 + CSS 变量 (light/dark)
│   │   ├── login/            # 登录页
│   │   ├── signup/           # 注册页
│   │   └── (routes)/         # 路由组: 带侧边栏的仪表板布局
│   │       ├── layout.tsx    # DashboardLayout (侧边栏 + 导航栏 + 主内容)
│   │       ├── dashboard/    # 录音/转录主页面
│   │       ├── sessions/     # 历史会话列表
│   │       └── profile/      # 用户资料页
│   ├── components/           # 业务组件
│   │   ├── audio-mode-selector.tsx   # 麦克风/标签页音频选择
│   │   ├── recording-controls.tsx    # 开始/暂停/停止/恢复
│   │   ├── transcript-feed.tsx       # 实时转录展示 + 保存
│   │   ├── sidebar.tsx               # 左侧导航
│   │   ├── navbar.tsx                # 顶部导航栏
│   │   └── theme-provider.tsx        # 主题切换包装
│   ├── hooks/
│   │   └── use-audio-recorder.ts     # 音频录制核心 hook
│   └── lib/
│       ├── store.ts          # Zustand: useRecordingStore (录音状态)
│       ├── session-storage.ts # Zustand: useSessionStore (会话状态)
│       ├── socket.ts         # Socket.io 客户端单例
│       ├── types.ts          # Session, TranscriptLine 接口
│       └── utils.ts          # cn() 工具函数
│
├── backend/
│   ├── prisma/schema.prisma  # 数据模型: User, Transcript, Summary
│   └── src/
│       ├── index.ts          # Express + HTTP Server + Socket.io 入口
│       ├── lib/prisma.ts     # PrismaPg 适配器 (PostgreSQL 连接池)
│       ├── middleware/authMiddleware.ts  # JWT 验证中间件
│       ├── routes/
│       │   ├── authroutes.ts         # POST /signup, /login, /me
│       │   ├── transcript.ts         # POST /save (保存转录)
│       │   └── sessions.ts           # GET/POST 会话管理 (3个端点)
│       └── socket/socket.ts  # Socket.io 服务器 + Deepgram 实时转录
```

### 关键架构决策

- **认证**: 无框架 JWT (7天过期)。前端 localStorage 存 token，后端 `verifyUser` 中间件校验 Bearer token。**无 Next.js middleware.ts**，仅客户端路由守卫。
- **实时通信**: 前端通过 Socket.io 发送 `audio-chunk` blob，后端连接到 Deepgram Live API (nova-2-general 模型)，将转录结果实时推送给前端。
- **AI 集成**: Gemini 2.5 Flash 用于生成转录摘要，结果缓存在 Summary 表中。Deepgram 用于实时语音转文字。
- **状态管理**: Zustand 两个 store — `useRecordingStore` (录音状态) 和 `useSessionStore` (会话数据，实际使用较少)。
- **UI 框架**: Shadcn/UI (new-york 风格) + Tailwind CSS v4 (CSS 配置，无 tailwind.config.js)。

### API 端点

| 方法 | 端点 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/auth/signup` | 否 | 用户注册 |
| POST | `/api/auth/login` | 否 | 用户登录 |
| GET | `/api/auth/me` | 是 | 获取当前用户 |
| POST | `/api/transcript/save` | 是 | 保存转录 |
| GET | `/api/transcript` | 是 | 获取用户所有转录 |
| GET | `/api/transcript/:id` | 是 | 获取单个转录详情 |
| POST | `/api/transcript/:id/summary` | 是 | 生成/获取摘要 |
| (Socket) | `audio-chunk` | N/A | 发送音频块 |
| (Socket) | `transcript` (事件) | N/A | 接收实时转录 |

### 数据库模型 (Prisma)

- **User**: id, name, email (唯一), password (bcrypt), avatarUrl, emailVerified, 时间戳
- **Transcript**: id, userId (FK), title, fullText (TEXT), 时间戳
- **Summary**: id, userId (FK), transcriptId (唯一), text, 时间戳

### 已知问题

- 后端无 `dev`/`build` 脚本，TypeScript 编译需手动处理
- Deepgram 连接按客户端建立，仅在 disconnect 时关闭，重连场景可能有资源泄漏
- 每个 audio-chunk 事件都在磁盘保存独立 `.webm` 文件，无清理机制
- 无测试覆盖
