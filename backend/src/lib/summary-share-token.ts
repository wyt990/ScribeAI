import jwt from "jsonwebtoken";

export type SummarySharePayload = {
  purpose: "summary_share";
  userId: string;
  sessionId: string;
  summaryType: string;
};

export function createSummaryShareToken(
  payload: Omit<SummarySharePayload, "purpose">
): string {
  const secret = process.env.JWT_SECRET!;
  const expiresIn = process.env.SUMMARY_SHARE_TOKEN_EXPIRES || "7d";
  return jwt.sign({ ...payload, purpose: "summary_share" }, secret, {
    expiresIn,
  } as jwt.SignOptions);
}

export function verifySummaryShareToken(token: string): SummarySharePayload {
  const secret = process.env.JWT_SECRET!;
  const decoded = jwt.verify(token, secret) as SummarySharePayload;
  if (decoded.purpose !== "summary_share") {
    throw new Error("Invalid share token purpose");
  }
  if (!decoded.userId || !decoded.sessionId || !decoded.summaryType) {
    throw new Error("Invalid share token payload");
  }
  return decoded;
}
