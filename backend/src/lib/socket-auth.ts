import jwt from "jsonwebtoken";
import { prisma } from "./prisma";

export type SocketAuthUser = {
  id: string;
  email?: string;
};

function extractTokenFromHandshake(
  authToken: unknown,
  authorization: unknown
): string | null {
  if (typeof authToken === "string" && authToken.trim()) {
    return authToken.trim();
  }
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
    return authorization.slice(7).trim() || null;
  }
  return null;
}

/** 校验 Socket 握手 token，与 REST verifyUser 逻辑一致 */
export async function authenticateSocketHandshake(
  authToken: unknown,
  authorization: unknown
): Promise<SocketAuthUser | null> {
  const token = extractTokenFromHandshake(authToken, authorization);
  if (!token) return null;

  try {
    const secret = process.env.JWT_SECRET!;
    const decoded = jwt.verify(token, secret) as { id?: string; email?: string };
    if (!decoded.id) return null;

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user || !user.isActive) return null;

    return { id: user.id, email: user.email };
  } catch {
    return null;
  }
}
