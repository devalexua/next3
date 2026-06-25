import bcrypt from "bcryptjs";
import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "./prisma.js";

const cookieName = "next3_session";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function setSession(reply: FastifyReply, userId: string): Promise<void> {
  reply.setCookie(cookieName, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSession(reply: FastifyReply): void {
  reply.clearCookie(cookieName, { path: "/" });
}

export async function getCurrentUser(request: FastifyRequest) {
  const userId = request.cookies[cookieName];
  if (!userId) return null;

  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, createdAt: true },
  });
}

export async function requireUser(request: FastifyRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    const error = new Error("Authentication required") as Error & { statusCode?: number };
    error.statusCode = 401;
    throw error;
  }

  return user;
}
