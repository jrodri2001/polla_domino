import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";
export type { UserRole } from "@/lib/types";

export interface Session {
  userId: string;
  email: string;
  role: UserRole;
  playerId: string;
}

export async function getSession(): Promise<Session | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: player, error } = await supabase
    .from("players")
    .select("id, role")
    .eq("auth_id", user.id)
    .single();

  if (error) {
    console.error("[getSession] player query failed:", error.message, "user.id:", user.id);
  }

  if (!player) return null;

  return {
    userId: user.id,
    email: user.email ?? "",
    role: (player.role as UserRole) ?? "player",
    playerId: player.id,
  };
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