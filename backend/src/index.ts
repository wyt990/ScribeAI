import express from "express";
import cors from "cors";
import http from "http";
import dotenv from "dotenv";
dotenv.config();

import authRoutes from "./routes/authroutes";
import transcript from "./routes/transcript"
import sessions from "./routes/sessions"
import drafts from "./routes/drafts"
import { createSocketServer, startStaleSessionCleanup } from "./socket/socket";
import { startDraftCleanup } from "./lib/draft-cleanup";

const app = express();
const server = http.createServer(app);

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

const PORT = 4000;
server.listen(PORT, () => {
  console.log(`HTTP server running at http://localhost:${PORT}`);
  console.log(`Socket.io running at ws://localhost:${PORT}`);
});
