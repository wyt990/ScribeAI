# CLAUDE.md

此文件为 Claude Code (claude.ai/code) 在此仓库中工作提供指导。

## 项目概述

ScribeAI 是一个 AI 驱动的音频记录与会议转录应用，支持麦克风/标签页音频录制、实时转录（Deepgram 或 OpenAI 兼容 ASR）和 AI 摘要生成（Gemini / OpenAI 兼容 LLM + Agent Skills 模板体系）。采用前后端分离架构，附带 Android WebView 原生壳。

## 常用命令

### 前端 (Next.js 16 + React 19 + TypeScript)

```bash
cd frontend
npm run dev          # 启动开发服务器 (Next.js)
npm run build        # 生产构建
npm start            # 启动生产服务器 (端口 3001)
npm run lint         # ESLint 检查
```

### 后端 (Express 5 + TypeScript)

```bash
cd backend
npm run build        # prisma generate + tsc (编译到 dist/)
npm start            # node dist/index.js (生产服务器)
npx ts-node src/index.ts  # 开发时直接运行 TS (需确保依赖已安装)
npx prisma generate       # 生成 Prisma Client
npx prisma db push        # 同步数据库表结构（开发环境快速建表）
npx prisma migrate deploy # 应用所有未执行的迁移（生产环境）
npm run build        # prisma generate + tsc + 复制 generated 到 dist
```

> **注意**: 后端端口固定为 4000。长耗时请求超时默认 300s（`HTTP_LONG_REQUEST_MS`）。

### 测试摘要 prompt

```bash
cd backend
npx ts-node scripts/test-summary-prompt.ts          # 仅构建 prompt
npx ts-node scripts/test-summary-prompt.ts --llm    # 真实调用 LLM
```

### 安卓原生壳

```bash
# Android-Client/ — Android Studio 打开即可构建
# 构建前先执行一次下载 DTLN 降噪模型：
cd Android-Client && bash scripts/download-dtln-models.sh
```

## 环境变量

在 `backend/.env` 中配置：

```
DATABASE_URL=mysql://...
JWT_SECRET=your_jwt_secret
SUMMARY_PROVIDER=gemini              # gemini | openai_compatible
STT_PROVIDER=deepgram                # deepgram | openai_asr
DEEPGRAM_API_KEY=...
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
OPENAI_LLM_API_KEY=sk-xxx
OPENAI_LLM_BASE_URL=https://api.deepseek.com/v1
OPENAI_LLM_MODEL=deepseek-chat
OPENAI_LLM_MAX_TOKENS=4096
OPENAI_LLM_TEMPERATURE=0.3
VAD_ENABLED=true                     # Silero VAD 开关
```

完整环境变量列表见 `README.md` 或 `backend/.env.example`（如存在）。

## 核心架构

### STT 双模式

| 模式 | 驱动方式 | 适用场景 |
|------|----------|----------|
| **Deepgram** (`deepgram`) | Socket.io 实时流式，每块音频直接发送给 Deepgram Live API | 实时性要求高，有 Deepgram API key |
| **OpenAI ASR** (`openai_asr`) | VAD 分段（前端 Silero VAD）或定时切片（5s 兜底） | 使用 OpenAI 兼容 ASR（funASR 等） |

- VAD 模式：前端 `@ricky0123/vad-web` 检测语音边界，`segment-end` 事件发送 WAV 到后端，后端用 `seq` 重排序
- 非 VAD 模式：5s 定时切片，`lastTranscriptLength` 增量去重
- 原生模式（安卓壳）：逐片独立 WAV，逐片调用 ASR

### 草稿 → 转录 → 纪要 流程

```
录音开始 → 创建 Draft (status=recording)
  ├─ 实时转录追加到 Draft.fullText（防抖写入）
  ├─ 音频分片写入 uploads/{userId}/{recordingId}/
  └─ 停止录音 → Draft 转为 stopped
       └─ 用户点击「保存为正式会话」
            ├─ Draft → Transcript（转正）
            └─ 可选：生成 Summary（选择模板）
```

### 纪要模板体系（双层级）

```
SummarySkill（定义规则 + 步骤 + 输出结构）
    └── SummaryTemplate（用户可见的模板实例，引用一个 Skill）
            └── Summary（每次生成的纪要结果，记录 templateId + version）
```

- 模板解析优先级：用户指定 templateId → legacy summaryType → 用户默认模板 → 系统默认模板
- 同一 `(transcriptId, templateId)` 只缓存一份 Summary，regenerate 覆盖

### 音频归档

- 录音分片实时写入 `uploads/{userId}/{recordingId}/` 目录
- 停止录音时合成为完整 `recording.webm` 或 `recording.wav`
- 支持按 recordingId 流式播放、重新转写
- 自动清理：不完整录音 7 天，完整录音 30 天（可配置）

### 认证

- 无框架 JWT（7 天过期），前端 localStorage 存 token
- 无 Next.js middleware.ts，仅客户端路由守卫
- Socket.io 连接通过 handshake auth token 鉴权
- 角色体系：`user` | `manager`，`requireManager` 中间件保护管理端路由

## API 端点

### 认证
| 方法 | 端点 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/auth/signup` | 否 | 用户注册 |
| POST | `/api/auth/login` | 否 | 用户登录 |
| GET | `/api/auth/me` | 是 | 获取当前用户 |

### 转录
| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/transcript/save` | 保存转录 |
| GET | `/api/transcript` | 用户所有转录 |
| GET | `/api/transcript/:id` | 单个转录详情 |
| POST | `/api/transcript/:id/summary` | 生成/获取摘要 |

### 会话
| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/sessions` | 会话列表（支持全文搜索） |
| GET | `/api/sessions/:id` | 会话详情 |
| DELETE | `/api/sessions/:id` | 删除会话 |
| GET | `/api/sessions/:id/summary/preview` | 摘要预览 |
| GET | `/api/sessions/:id/summary/export?format=docx\|pdf` | 导出 |
| POST | `/api/sessions/:id/summary/share-link` | 生成分享链接 |

### 草稿
| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/drafts` | 草稿列表 |
| POST | `/api/drafts` | 创建草稿 |
| PATCH | `/api/drafts/:id` | 更新草稿 |
| DELETE | `/api/drafts/:id` | 删除草稿 |
| POST | `/api/drafts/:id/promote` | 转正为正式会话 |

### 纪要模板
| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/templates` | 列出模板 |
| POST | `/api/templates` | 创建模板 |
| POST | `/api/templates/generate-draft` | AI 生成模板草稿 |
| PUT | `/api/templates/:id` | 编辑模板 |
| DELETE | `/api/templates/:id` | 删除模板 |
| POST | `/api/templates/:id/fork` | 复制模板 |
| POST | `/api/templates/:id/preview` | 试跑预览 |
| POST | `/api/templates/:id/default` | 设为默认 |
| POST | `/api/templates/:id/submit-public` | 提交公共审核 |

### 管理后台 (`/api/manager/*`)
| 方法 | 端点 | 说明 |
|------|------|------|
| GET/POST/PUT/DELETE | `/api/manager/users` | 用户 CRUD |
| GET/PATCH | `/api/manager/settings` | 系统设置 |
| GET | `/api/manager/stats` | 统计 |
| GET/DELETE | `/api/manager/content` | 内容管理 |
| GET | `/api/manager/audit` | 审计日志 |
| GET | `/api/manager/observability` | 可观测性 |

### 其他
| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/downloads/recording/:id` | 下载录音文件 |
| GET | `/api/user-orgs` | 用户组织列表 |
| GET | `/api/app-config` | 客户端 UI 配置（公开） |

### Socket 事件
| 事件 | 方向 | 说明 |
|------|------|------|
| `audio-chunk` | 前端 → 后端 | 发送音频块 |
| `start-recording` | 前端 → 后端 | 开始录音 |
| `stop-recording` | 前端 → 后端 | 停止录音 |
| `segment-end` | 前端 → 后端 | VAD 段结束（发送 WAV） |
| `transcript` | 后端 → 前端 | 实时转录文本 |
| `segment-result` | 后端 → 前端 | VAD 段转录结果 `{seq, text}` |
| `deepgram-ready` | 后端 → 前端 | Deepgram 连接就绪 |
| `vad-config` | 后端 → 前端 | VAD 参数下发 |

## 数据库模型（Prisma + MySQL）

关键模型及关系：

- **User** — 用户，含 role（user/manager）、isActive
- **Draft** — 草稿（录音中），含 status（recording/paused/stopped）、recordedAt、orgId
- **Transcript** — 正式会话，含 fullText（TEXT）、recordedAt、recordingId、orgId
- **Summary** — 纪要结果，按 `(transcriptId, templateId)` 唯一
- **SummarySkill** — 模板技能（规则+步骤+输出结构），支持 fork
- **SummaryTemplate** — 用户模板实例，引用 Skill
- **Organization** / **UserOrganization** — 组织与多对多关系（含职务/职责）
- **SystemSetting** — 键值对系统设置（分组、敏感标记）
- **AuditLog** — 审计日志
- **OperationTrace** — 运行时追踪（录音/摘要/socket 等）

其他注意：
- 非 PG 使用 PrismaPg 适配器，实际使用 `mysql` provider
- 全文搜索使用 MySQL ngram 解析器（中文支持）
- Summary 使用 `@@unique([transcriptId, templateId])` 而非单列唯一

## 关键模式 / 约定

- **Socket 单例**：`frontend/lib/socket.ts` 导出一个 socket.io 客户端单例，不重复连接
- **listenersAttachedRef**：防止 socket 监听器重复绑定，cleanup 用 `.off()` 而非 `disconnect()`
- **AccumulatedChunks 永不清理**：OpenAI ASR 模式的音频缓冲区保留 EBML header，不清空，用 `lastTranscriptLength` 增量去重
- **clearTranscript()**：清空转录数组应使用 `clearTranscript()`（设为 `[]`），而非 `setTranscript("")`（会变成 `[""]`）
- **操作追踪**：全链路 `writeOperationTrace()` （异步非阻塞），用于监控录音/STT/摘要等环节
- **音频增强**：前端 `buildAudioPipeline()` 组装 GainNode + RNNoise AudioWorklet + DynamicsCompressorNode

## Android 原生客户端

`Android-Client/` 是一个 Android WebView 壳应用，通过 `ScribeAINativeBridge`（`window.ScribeAINative`）与前端通信。关键特性：

- **原生持麦**：`ChunkedPcmRecorder.kt` 16kHz PCM 采音 + DTLN 降噪（ONNX Runtime）+ 软件增益
- **WebView 事件桥**：`NativeRecordingCoordinator.kt` 通过自定义 DOM 事件传递音频分片和时间戳
- **Token 持久化**：`AuthSessionStore.kt` 将 JWT 备份到原生 SharedPreferences

## 已知问题

- 后端 `package.json` 无 `dev` 脚本，TypeScript 编译需手动 `npx tsc`
- Deepgram 连接按客户端建立，仅在 disconnect 时关闭，重连场景可能有资源泄漏
- 无测试覆盖（前端和后端均未配置测试框架）
- 前端 VAD 模式下 ONNX Runtime 首次加载 ~12MB 模型文件
- 音频归档清理机制依赖定时任务，不提供手动触发端点
