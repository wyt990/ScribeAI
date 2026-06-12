import fs from "fs";
import path from "path";
import { Router } from "express";
import {
  verifyUser,
  verifyUserBearerOrQuery,
  AuthenticatedRequest,
} from "../middleware/authMiddleware";

const router = Router();

const APK_PATH =
  process.env.ANDROID_APK_PATH ||
  path.join(__dirname, "../../downloads/scribeai-android.apk");

const APK_FILENAME = "ScribeAI-android.apk";

function getApkMeta() {
  if (!fs.existsSync(APK_PATH)) return null;
  const stat = fs.statSync(APK_PATH);
  return {
    fileName: APK_FILENAME,
    size: stat.size,
    updatedAt: stat.mtime.toISOString(),
  };
}

router.get("/android/info", verifyUser, (_req: AuthenticatedRequest, res) => {
  const meta = getApkMeta();
  if (!meta) {
    return res.json({ available: false });
  }
  return res.json({ available: true, ...meta });
});

router.get("/android", verifyUserBearerOrQuery, (_req: AuthenticatedRequest, res) => {
  if (!fs.existsSync(APK_PATH)) {
    return res.status(404).json({ error: "Android 安装包暂未发布" });
  }

  res.setHeader("Content-Type", "application/vnd.android.package-archive");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${APK_FILENAME}"`
  );
  return res.sendFile(path.resolve(APK_PATH));
});

export default router;
