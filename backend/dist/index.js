"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = __importDefault(require("http"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const authroutes_1 = __importDefault(require("./routes/authroutes"));
const transcript_1 = __importDefault(require("./routes/transcript"));
const sessions_1 = __importDefault(require("./routes/sessions"));
const drafts_1 = __importDefault(require("./routes/drafts"));
const templates_1 = __importDefault(require("./routes/templates"));
const manager_1 = __importDefault(require("./routes/manager"));
const downloads_1 = __importDefault(require("./routes/downloads"));
const organizations_1 = __importDefault(require("./routes/organizations"));
const app_config_1 = __importDefault(require("./routes/app-config"));
const summary_template_seed_1 = require("./lib/summary-template-seed");
const system_settings_1 = require("./lib/system-settings");
const socket_1 = require("./socket/socket");
const audio_cleanup_1 = require("./lib/audio-cleanup");
const draft_cleanup_1 = require("./lib/draft-cleanup");
const operation_trace_cleanup_1 = require("./lib/operation-trace-cleanup");
const summary_llm_1 = require("./lib/summary-llm");
try {
    (0, summary_llm_1.validateSummaryConfig)();
}
catch (err) {
    console.error("[SummaryLLM] Config error:", err);
    process.exit(1);
}
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
// 允许长耗时请求（如 LLM 结构化摘要），避免代理/连接提前断开
const LONG_REQUEST_MS = Number(process.env.HTTP_LONG_REQUEST_MS || "300000");
server.requestTimeout = LONG_REQUEST_MS;
server.headersTimeout = LONG_REQUEST_MS + 10000;
server.keepAliveTimeout = 65000;
// Initialize socket server
(0, socket_1.createSocketServer)(server);
(0, audio_cleanup_1.startAudioCleanup)();
(0, draft_cleanup_1.startDraftCleanup)();
(0, operation_trace_cleanup_1.startOperationTraceCleanup)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// REST Routes
app.use("/api/auth", authroutes_1.default);
app.use('/api/transcript', transcript_1.default);
app.use('/api/sessions', sessions_1.default);
app.use('/api/drafts', drafts_1.default);
app.use('/api/templates', templates_1.default);
app.use('/api/manager', manager_1.default);
app.use('/api/downloads', downloads_1.default);
app.use('/api/user-orgs', organizations_1.default);
app.use('/api/app-config', app_config_1.default);
const PORT = 4000;
void (async () => {
    try {
        await (0, summary_template_seed_1.ensureSystemSummaryTemplates)();
        await (0, system_settings_1.ensureSystemSettingsSeeded)();
        await (0, system_settings_1.applySettingsToEnv)();
    }
    catch (err) {
        console.error('[Startup seed] failed:', err);
    }
})();
server.listen(PORT, () => {
    console.log(`HTTP server running at http://localhost:${PORT}`);
    console.log(`Socket.io running at ws://localhost:${PORT}`);
    const summaryProvider = (0, summary_llm_1.getSummaryProviderLabel)();
    console.log(`Summary LLM provider: ${summaryProvider}`);
    if (summaryProvider === "openai_compatible") {
        console.log(`Summary LLM endpoint: ${(0, summary_llm_1.getResolvedChatCompletionsUrl)()}`);
    }
});
//# sourceMappingURL=index.js.map