import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./authMiddleware";
import { verifyUser } from "./authMiddleware";
import { verifySummaryShareToken } from "../lib/summary-share-token";

export type SummaryAuthRequest = AuthenticatedRequest & {
  summaryShare?: {
    userId: string;
    sessionId: string;
    templateId?: string;
    summaryType?: string;
  };
};

/** Bearer JWT 或 ?shareToken= 分享令牌 */
export async function verifyUserOrShareToken(
  req: SummaryAuthRequest,
  res: Response,
  next: NextFunction
) {
  const shareToken =
    typeof req.query.shareToken === "string" ? req.query.shareToken : undefined;

  if (shareToken) {
    try {
      const payload = verifySummaryShareToken(shareToken);
      if (payload.sessionId !== req.params.id) {
        return res.status(403).json({ error: "Share token does not match session" });
      }
      req.summaryShare = {
        userId: payload.userId,
        sessionId: payload.sessionId,
        templateId: payload.templateId,
        summaryType: payload.summaryType,
      };
      req.user = { id: payload.userId };
      return next();
    } catch (err) {
      console.error("[SummaryShare] token error:", err);
      const expired =
        err instanceof Error &&
        (err.name === "TokenExpiredError" || err.message.includes("expired"));
      return res.status(401).json({
        error: expired
          ? "分享链接已过期，请联系分享者重新生成链接"
          : "分享链接无效，请检查是否复制完整",
        code: expired ? "SHARE_TOKEN_EXPIRED" : "SHARE_TOKEN_INVALID",
      });
    }
  }

  return verifyUser(req, res, next);
}
