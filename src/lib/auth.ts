import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type UserRole = "admin" | "player";

export interface Session {
  userId: string;
  email: string;
  role: UserRole;
  playerId: string | null;
}

export async function getSession(): Promise<Session | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, player_id")
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("[getSession] profile query failed:", error.message, "user.id:", user.id);
  }

  return {
    userId: user.id,
    email: user.email ?? "",
    role: (profile?.role as UserRole) ?? "player",
    playerId: profile?.player_id ?? null,
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