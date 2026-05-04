"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

export type AuthActionState = { error?: string; message?: string; success?: boolean } | null;

export async function signUp(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const supabase = await createClient();
  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;

  if (!name || !email || !password) {
    return { error: "Todos los campos son obligatorios" };
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

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
    },
  });

  if (error) {
    if (error.message.includes("already registered")) {
      return { error: "Ya existe una cuenta con ese email" };
    }
    return { error: error.message };
  }

  // If Supabase has email confirmation enabled, session will be null
  if (!data.session) {
    return {
      success: true,
      message: "Cuenta creada. Revisa tu email para confirmar tu cuenta antes de iniciar sesión.",
    };
  }

  redirect("/");
}

export async function signIn(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const supabase = await createClient();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email y contraseña son obligatorios" };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.includes("Email not confirmed")) {
      return { error: "Debes confirmar tu email antes de iniciar sesión. Revisa tu bandeja de entrada." };
    }
    return { error: "Email o contraseña incorrectos" };
  }

  redirect("/");
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  });

  if (error || !data.url) {
    redirect("/login?error=oauth");
  }

  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}