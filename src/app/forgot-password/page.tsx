"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotPassword, type AuthActionState } from "@/lib/actions/auth";

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(
    forgotPassword,
    null,
  );

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Recuperar Contraseña</h1>
          <p className="mt-1 text-sm text-muted">
            Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña
          </p>
        </div>

        <form action={formAction} className="space-y-4">
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
            {pending ? "Enviando..." : "Enviar enlace"}
          </button>
        </form>

        <p className="text-center text-sm text-muted">
          <Link href="/login" className="text-primary hover:underline">
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}