import express from "express";
import cors from "cors";
import http from "http";
import dotenv from "dotenv";
dotenv.config();

import authRoutes from "./routes/authroutes";
import transcript from "./routes/transcript"
import sessions from "./routes/sessions"
import drafts from "./routes/drafts"
import templates from "./routes/templates"
import manager from "./routes/manager"
import downloads from "./routes/downloads"
import organizations from "./routes/organizations"
import appConfig from "./routes/app-config"
import { runStartupSeed, getStartupSeedStatus } from "./lib/startup-seed";
import { createSocketServer } from "./socket/socket";
import { startAudioCleanup } from "./lib/audio-cleanup";
import { startDraftCleanup } from "./lib/draft-cleanup";
import { startOperationTraceCleanup } from "./lib/operation-trace-cleanup";
import {
  validateSummaryConfig,
  getSummaryProviderLabel,
  getResolvedChatCompletionsUrl,
} from "./lib/summary-llm";

try {
  validateSummaryConfig();
} catch (err) {
  console.error("[SummaryLLM] Config error:", err);
  process.exit(1);
}

const app = express();
const server = http.createServer(app);

// 允许长耗时请求（如 LLM 结构化摘要），避免代理/连接提前断开
const LONG_REQUEST_MS = Number(process.env.HTTP_LONG_REQUEST_MS || "300000");
server.requestTimeout = LONG_REQUEST_MS;
server.headersTimeout = LONG_REQUEST_MS + 10_000;
server.keepAliveTimeout = 65_000;

// Initialize socket server
createSocketServer(server);

startAudioCleanup();
startDraftCleanup();
startOperationTraceCleanup();

app.use(cors());
app.use(express.json());

// REST Routes
app.use("/api/auth", authRoutes);
app.use('/api/transcript', transcript);
app.use('/api/sessions', sessions);
app.use('/api/drafts', drafts);
app.use('/api/templates', templates);
app.use('/api/manager', manager);
app.use('/api/downloads', downloads);
app.use('/api/user-orgs', organizations);
app.use('/api/app-config', appConfig);

app.get('/api/health', (_req, res) => {
  const seed = getStartupSeedStatus();
  if (seed.ready) {
    res.json({ status: 'ok', startupSeed: { ready: true } });
    return;
  }
  res.status(503).json({
    status: 'degraded',
    startupSeed: { ready: false, error: seed.error },
  });
});

const PORT = 4000;

void runStartupSeed().finally(() => {
  server.listen(PORT, () => {
    const seed = getStartupSeedStatus();
    console.log(`HTTP server running at http://localhost:${PORT}`);
    console.log(`Socket.io running at ws://localhost:${PORT}`);
    if (!seed.ready) {
      console.error(
        `[Startup seed] service started in degraded mode: ${seed.error ?? 'unknown error'}`
      );
    }
    const summaryProvider = getSummaryProviderLabel();
    console.log(`Summary LLM provider: ${summaryProvider}`);
    if (summaryProvider === "openai_compatible") {
      console.log(`Summary LLM endpoint: ${getResolvedChatCompletionsUrl()}`);
    }
  });
});
