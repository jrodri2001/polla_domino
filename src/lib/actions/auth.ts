"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

export type AuthActionState = { error?: string; message?: string; success?: boolean; email?: string } | null;

export async function signUp(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const supabase = await createClient();
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
      email,
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
  const origin = process.env.SITE_URL || (await headers()).get("origin") || "http://localhost:3000";

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

export async function forgotPassword(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const supabase = await createClient();
  const email = (formData.get("email") as string)?.trim().toLowerCase();

  if (!email) {
    return { error: "Email es obligatorio" };
  }

  const origin = process.env.SITE_URL || (await headers()).get("origin") || "http://localhost:3000";

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  if (error) {
    return { error: error.message };
  }

  return {
    success: true,
    message: "Si existe una cuenta con ese email, recibirás un enlace para restablecer tu contraseña.",
  };
}

export async function resetPassword(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const supabase = await createClient();
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

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: error.message };
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}