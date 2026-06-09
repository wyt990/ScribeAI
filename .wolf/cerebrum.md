# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-06-08

## User Preferences

<!-- How the user likes things done. Code style, tools, patterns, communication. -->

## Key Learnings

- **Project:** ScribeAI
- **Description:** ScribeAI is a modern, **AI‑powered audio scribing and meeting transcription app** that enables users to capture **mic audio**, **tab audio**, and **generate real‑time transcription** with the power of

## Do-Not-Repeat

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

- [2026-06-09] 不要调用 `setTranscript("")` 来清空 transcript。这会设置 transcript 为 `[""]`（非空数组）。应使用 `clearTranscript()` 来清空为 `[]`。
- [2026-06-09] 在 `use-audio-recorder.ts` 的 `initSocket()` 中，应使用 `listenersAttachedRef` 防止重复添加 socket 监听器。清理时应使用 `.off()` 移除监听器，而不是断开 socket（socket 是持久单例）。
- [2026-06-09] OpenAI ASR 处理中，不要清空音频分片缓冲区。WebM 文件的 EBML header 只在第一个分片中，清除缓冲区会导致后续 ASR API 调用发送无效的 WebM。应使用永不清理的完整累积缓冲区（`accumulatedChunks`），并配合 `lastTranscriptLength` 做去重。

## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->

- [2026-06-09] VAD 使用前端 Silero VAD（`@ricky0123/vad-web`）而非后端 VAD。原因：浏览器端运行，不占服务器资源；通过 CDN 加载 ONNX 模型（~12MB 首次加载），支持 Chrome/Edge/Safari/iOS/Android。
- [2026-06-09] VAD 使用 `MicVAD` 并传入已有 MediaStream，而非 `AudioNodeVAD`（代码编译后未导出）。与 MediaRecorder 共享同一流，避免重复 getUserMedia。
- [2026-06-09] VAD 检测到说话结束时触发 `segment-end` 事件，后端 flush 全部 `accumulatedChunks`（不清空）到 ASR，用 `lastTranscriptLength` 去重文本，返回 `{seq, text}` 供前端重排序。
- [2026-06-09] 后端 `accumulatedChunks` 永不清理（保留 EBML header）。VAD 模式和旧 5s 定时模式通过 `VAD_ENABLED` 切换。
- [2026-06-09] VAD 配置存储在 `backend/.env`，通过 `vad-config` socket 事件在连接时下发到前端。前端使用 `vadConfigRef` 保存以避免重新渲染。
- [2026-06-09] `listenersAttachedRef` 模式防止 socket 监听器重复绑定：`initSocket` 只绑定一次，cleanup 使用 `.off()` 而非 `disconnect()`（socket 是持久单例）。
- [2026-06-09] VAD 模式下不启动 5s slice timer；仅当 `VAD_ENABLED=false` 时启动 fallback timer。在 `stop-recording` 时 flush 剩余音频。
