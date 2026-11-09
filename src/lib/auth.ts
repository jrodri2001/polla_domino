import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/jwt";
import { db } from "@/lib/db";
import type { UserRole } from "@/lib/types";
export type { UserRole } from "@/lib/types";

export interface Session {
  userId: string;
  email: string;
  role: UserRole;
  playerId: string;
}

export async function getSession(): Promise<Session | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;

    const payload = await verifySession(token);
    if (!payload) return null;

    // Verify player exists and is active in database
    const player = db
      .prepare("SELECT id, email, role, active FROM players WHERE id = ?")
      .get(payload.playerId) as { id: string; email: string; role: string; active: number } | undefined;

    if (!player || !player.active) return null;

    return {
      userId: player.id,
      email: player.email,
      role: (player.role as UserRole) ?? "player",
      playerId: player.id,
    };
  } catch (err: unknown) {
    if ((err as { digest?: string })?.digest === "DYNAMIC_SERVER_USAGE") {
      throw err;
    }
    console.error("[getSession] error:", err);
    return null;
  }
}

export async function requireAuth(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireAdmin(): Promise<Session> {
  const session = await requireAuth();
  if (session.role !== "admin") redirect("/");
  return session;
}