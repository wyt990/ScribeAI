// routes/auth.js

import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma"; // Make sure prisma is exported from here
import { verifyUser, AuthenticatedRequest } from '../middleware/authMiddleware';
const router = Router();

/* ============================================================
   SIGNUP ROUTE
============================================================ */
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate
    if (!name || !email || !password) {
      return res.status(400).json({ error: "所有字段均为必填" });
    }

    // Check if existing user
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      return res.status(400).json({ error: "该邮箱已被注册" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 检查是否为第一个用户，第一个用户自动设为管理员
    const userCount = await prisma.user.count();
    const role = userCount === 0 ? "manager" : "user";

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
      },
    });

    // Create JWT
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );
    

    return res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/* ============================================================
   LOGIN ROUTE
============================================================ */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate
    if (!email || !password) {
      return res.status(400).json({ error: "邮箱和密码均为必填" });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(400).json({ error: "邮箱或密码错误" });
    }

    // Compare password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(400).json({ error: "邮箱或密码错误" });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: "账号已禁用，请联系管理员" });
    }

    // Create JWT
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );
    

    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;


interface JWTPayload {
  id: string;
  email: string;
}



router.get("/me",verifyUser, async (req: AuthenticatedRequest, res) => {

  const userId = req.user!.id;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    if (!user) return res.status(401).json({ error: "用户不存在" });

    return res.json({ user });
  } catch (err) {
    console.error(err);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
});

/* ============================================================
   UPDATE PROFILE ROUTE
============================================================ */
router.put("/profile", verifyUser, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { name, email } = req.body;

    // 至少需要提供一个字段
    if (!name && !email) {
      return res.status(400).json({ error: "请提供要更新的字段" });
    }

    // 如果更新邮箱，检查是否已被其他用户使用
    if (email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing && existing.id !== userId) {
        return res.status(400).json({ error: "该邮箱已被其他账户使用" });
      }
    }

    // 构建更新数据
    const updateData: Record<string, string> = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: { id: true, name: true, email: true, role: true },
    });

    return res.json({ user: updatedUser });
  } catch (err) {
    console.error("Update profile error:", err);
    return res.status(500).json({ error: "更新资料失败" });
  }
});
