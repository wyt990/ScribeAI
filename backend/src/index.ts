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
import { ensureSystemSummaryTemplates } from "./lib/summary-template-seed";
import { ensureSystemSettingsSeeded, applySettingsToEnv } from "./lib/system-settings";
import { createSocketServer, startStaleSessionCleanup } from "./socket/socket";
import { startDraftCleanup } from "./lib/draft-cleanup";
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

// Start stale session cleanup timer (safety net for orphaned uploads)
startStaleSessionCleanup();
startDraftCleanup();

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

const PORT = 4000;

void (async () => {
  try {
    await ensureSystemSummaryTemplates();
    await ensureSystemSettingsSeeded();
    await applySettingsToEnv();
  } catch (err) {
    console.error('[Startup seed] failed:', err);
  }
})();

server.listen(PORT, () => {
  console.log(`HTTP server running at http://localhost:${PORT}`);
  console.log(`Socket.io running at ws://localhost:${PORT}`);
  const summaryProvider = getSummaryProviderLabel();
  console.log(`Summary LLM provider: ${summaryProvider}`);
  if (summaryProvider === "openai_compatible") {
    console.log(`Summary LLM endpoint: ${getResolvedChatCompletionsUrl()}`);
  }
});
