"use server";

import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "@/lib/db";
import { signSession, SESSION_COOKIE_NAME } from "@/lib/jwt";

export type AuthActionState = {
  error?: string;
  message?: string;
  success?: boolean;
  email?: string;
} | null;

export async function signUp(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirm_password") as string;

  if (!name || !email || !password || !confirmPassword) {
    return { error: "Todos los campos son obligatorios" };
  }

  if (password !== confirmPassword) {
    return { error: "Las contraseñas no coinciden" };
  }

  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres" };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { error: "La contraseña debe contener al menos una letra" };
  }
  if (!/[0-9]/.test(password)) {
    return { error: "La contraseña debe contener al menos un número" };
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    return { error: "La contraseña debe contener al menos un carácter especial" };
  }

  // Check if player already exists
  const existing = db
    .prepare("SELECT id, email, password_hash FROM players WHERE LOWER(email) = LOWER(?)")
    .get(email) as { id: string; email: string; password_hash: string | null } | undefined;

  const passwordHash = bcrypt.hashSync(password, 10);
  let playerId: string;
  let playerRole: "admin" | "player" = "player";

  if (existing) {
    if (existing.password_hash) {
      return { error: "Ya existe una cuenta con ese email" };
    }
    // Existing player registered by admin, update their password
    db.prepare(`
      UPDATE players
      SET name = ?, password_hash = ?, active = 1
      WHERE id = ?
    `).run(name, passwordHash, existing.id);
    playerId = existing.id;
  } else {
    playerId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO players (id, name, email, active, role, password_hash, created_at)
      VALUES (?, ?, ?, 1, 'player', ?, datetime('now'))
    `).run(playerId, name, email, passwordHash);
  }

  const token = await signSession({
    userId: playerId,
    email,
    role: playerRole,
    playerId,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect("/");
}

export async function signIn(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email y contraseña son obligatorios" };
  }

  const player = db
    .prepare("SELECT id, name, email, role, active, password_hash FROM players WHERE LOWER(email) = LOWER(?)")
    .get(email) as
    | {
        id: string;
        name: string;
        email: string;
        role: "admin" | "player";
        active: number;
        password_hash: string | null;
      }
    | undefined;

  if (!player || !player.active) {
    return { error: "Email o contraseña incorrectos" };
  }

  let valid = false;
  if (player.password_hash) {
    valid = bcrypt.compareSync(password, player.password_hash);
  } else {
    // If no password was set yet, accept default or allow setting it now
    if (password === "Domino2026!") {
      valid = true;
    }
  }

  if (!valid) {
    return { error: "Email o contraseña incorrectos" };
  }

  const token = await signSession({
    userId: player.id,
    email: player.email,
    role: player.role,
    playerId: player.id,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect("/");
}

export async function signInWithGoogle() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    redirect("/login?error=google_not_configured");
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "polla.juliorodriguez.ca";
  const proto = h.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;
  const redirectUri = `${origin}/auth/callback`;

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");

  redirect(url.toString());
}

export async function forgotPassword(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = (formData.get("email") as string)?.trim().toLowerCase();

  if (!email) {
    return { error: "Email es obligatorio" };
  }

  const player = db
    .prepare("SELECT id FROM players WHERE LOWER(email) = LOWER(?)")
    .get(email);

  if (player) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1 hour
    db.prepare(`
      INSERT INTO password_resets (id, email, token, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(crypto.randomUUID(), email, token, expiresAt);
  }

  return {
    success: true,
    message: "Si existe una cuenta con ese email, se ha generado el enlace para restablecer tu contraseña. (Contacta al administrador si requieres asistencia).",
  };
}

export async function resetPassword(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const password = formData.get("password") as string;

  if (!password) {
    return { error: "La contraseña es obligatoria" };
  }
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres" };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { error: "La contraseña debe contener al menos una letra" };
  }
  if (!/[0-9]/.test(password)) {
    return { error: "La contraseña debe contener al menos un número" };
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    return { error: "La contraseña debe contener al menos un carácter especial" };
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionToken) {
    return { error: "Sesión no válida" };
  }

  const hash = bcrypt.hashSync(password, 10);
  // Update password for logged in user
  const { verifySession } = await import("@/lib/jwt");
  const payload = await verifySession(sessionToken);
  if (!payload) return { error: "Sesión no válida" };

  db.prepare("UPDATE players SET password_hash = ? WHERE id = ?").run(hash, payload.playerId);

  redirect("/");
}

export async function signOut() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}