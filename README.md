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
ScribeAI/
├── app/
│   ├── login/
│   ├── signup/
│   ├── dashboard/
│   ├── sessions/
│   └── profile/
│
├── components/
│   ├── AudioModeSelector.tsx
│   ├── RecordingControls.tsx
│   ├── TranscriptFeed.tsx
│   ├── Sidebar.tsx
│   └── Navbar.tsx
│
├── hooks/
│   └── useAudioRecorder.ts
│
├── lib/
│   ├── socket.ts
│   ├── utils.ts
│   └── store.ts
│
└── styles/
    └── globals.css
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

# Gemini AI 摘要生成
GEMINI_API_KEY=key
GEMINI_API_URL=url

# STT 引擎选择: "deepgram" (默认, 实时流式) 或 "openai_asr" (定时切片伪流式)
STT_PROVIDER=deepgram

# OpenAI 兼容 ASR 配置 (STT_PROVIDER=openai_asr 时使用)
OPENAI_ASR_API_KEY=your-api-key
OPENAI_ASR_BASE_URL=http://your-server:8000/v1
OPENAI_ASR_MODEL=funasr-nano
OPENAI_ASR_LANGUAGE=zh

# 伪流式切片间隔 (秒)，每 N 秒发送一段音频进行转写
ASR_SLICE_INTERVAL=5
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

## 🙌 由 Ritik Jain 用心制作

🔗 [LinkedIn](https://www.linkedin.com/in/ritikjain00/) | ✉️ ritikjain6673@gmail.com
