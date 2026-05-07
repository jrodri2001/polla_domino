"use client";

import { useActionState } from "react";
import { resetPassword, type AuthActionState } from "@/lib/actions/auth";

export default function ResetPasswordPage() {
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(
    resetPassword,
    null,
  );

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Nueva Contraseña</h1>
          <p className="mt-1 text-sm text-muted">
            Ingresa tu nueva contraseña
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-muted">
              Nueva contraseña
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

          {state?.error && (
            <p className="text-sm text-danger">{state.error}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-background hover:bg-primary-hover disabled:opacity-40"
          >
            {pending ? "Guardando..." : "Guardar contraseña"}
          </button>
        </form>
      </div>
    </div>
  );
}