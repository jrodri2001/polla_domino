"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp, signInWithGoogle, type AuthActionState } from "@/lib/actions/auth";

export default function SignupPage() {
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(
    signUp,
    null,
  );

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Crear Cuenta</h1>
          <p className="mt-1 text-sm text-muted">
            Regístrate para ver tus torneos y resultados
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          <div>
            <label htmlFor="name" className="mb-1 block text-sm text-muted">
              Nombre
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              autoComplete="name"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
              placeholder="Tu nombre"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-1 block text-sm text-muted">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
              placeholder="tu@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-muted">
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
              placeholder="••••••••"
            />
            <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
              <li>Mínimo 8 caracteres</li>
              <li>Al menos una letra, un número y un carácter especial</li>
            </ul>
          </div>

          <div>
            <label htmlFor="confirm_password" className="mb-1 block text-sm text-muted">
              Confirmar Contraseña
            </label>
            <input
              id="confirm_password"
              name="confirm_password"
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          {state?.error && (
            <p className="text-sm text-danger">{state.error}</p>
          )}

          {state?.message && (
            <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
              {state.message}
            </div>
          )}

          <button
            type="submit"
            disabled={pending || state?.success}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-background hover:bg-primary-hover disabled:opacity-40"
          >
            {pending ? "Creando cuenta..." : "Crear Cuenta"}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background px-2 text-muted">o</span>
          </div>
        </div>

        <form action={signInWithGoogle}>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-surface"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continuar con Google
          </button>
        </form>

        <p className="text-center text-sm text-muted">
          ¿Ya tienes cuenta?{" "}
          <Link
            href={state?.email ? `/login?email=${encodeURIComponent(state.email)}` : "/login"}
            className="text-primary hover:underline"
          >
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  );
}