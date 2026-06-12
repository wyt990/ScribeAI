import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

export interface AuthenticatedRequest extends Request {
  user?: { id: string; email?: string };
}

async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  token: string | undefined
) {
  if (!token) {
    res.status(401).json({ error: "Token missing" });
    return false;
  }

  const secret = process.env.JWT_SECRET!;
  const decoded = jwt.verify(token, secret) as { id: string; email?: string };

  if (!decoded.id) {
    res.status(401).json({ error: "Invalid token payload" });
    return false;
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.id } });
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return false;
  }
  if (!user.isActive) {
    res.status(403).json({ error: "Account disabled" });
    return false;
  }

  req.user = { id: user.id, email: user.email };
  return true;
}

export const verifyUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization header missing or malformed" });
    }

    const token = authHeader.split(" ")[1];
    if (!(await authenticateToken(req, res, token))) return;
    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(401).json({ error: "Unauthorized" });
  }
};

/** 支持 Authorization 头或 ?token=，供浏览器直链下载大文件 */
export const verifyUserBearerOrQuery = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const headerToken =
      authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;
    const queryToken =
      typeof req.query.token === "string" ? req.query.token : undefined;
    const token = headerToken || queryToken;

    if (!token) {
      return res.status(401).json({ error: "Authorization required" });
    }

    if (!(await authenticateToken(req, res, token))) return;
    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(401).json({ error: "Unauthorized" });
  }
};
