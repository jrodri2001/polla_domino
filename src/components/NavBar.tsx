import Link from "next/link";
import { getSession } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";

export default async function NavBar() {
  const session = await getSession();
  const isAdmin = session?.role === "admin";

  return (
    <nav className="border-b border-border bg-surface">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-bold tracking-tight text-primary"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className="h-8 w-8">
            <rect width="64" height="64" rx="12" fill="#0f1b2d"/>
            <g transform="translate(18,33) rotate(-12)">
              <rect x="-10" y="-18" width="20" height="36" rx="2.5" fill="#fff"/>
              <line x1="-7" y1="0" x2="7" y2="0" stroke="#0f1b2d" strokeWidth="0.8"/>
              <circle cx="-4" cy="-13" r="1.8" fill="#0f1b2d"/><circle cx="4" cy="-13" r="1.8" fill="#0f1b2d"/>
              <circle cx="-4" cy="-7.5" r="1.8" fill="#0f1b2d"/><circle cx="4" cy="-7.5" r="1.8" fill="#0f1b2d"/>
              <circle cx="-4" cy="-2.5" r="1.8" fill="#0f1b2d"/><circle cx="4" cy="-2.5" r="1.8" fill="#0f1b2d"/>
              <circle cx="-4" cy="4" r="1.8" fill="#0f1b2d"/><circle cx="4" cy="4" r="1.8" fill="#0f1b2d"/>
              <circle cx="0" cy="9" r="1.8" fill="#0f1b2d"/>
              <circle cx="-4" cy="14" r="1.8" fill="#0f1b2d"/><circle cx="4" cy="14" r="1.8" fill="#0f1b2d"/>
            </g>
            <g transform="translate(46,33) rotate(12)">
              <rect x="-10" y="-18" width="20" height="36" rx="2.5" fill="#fff"/>
              <line x1="-7" y1="0" x2="7" y2="0" stroke="#0f1b2d" strokeWidth="0.8"/>
              <circle cx="-4" cy="-12" r="1.8" fill="#0f1b2d"/><circle cx="4" cy="-12" r="1.8" fill="#0f1b2d"/>
              <circle cx="-4" cy="-4" r="1.8" fill="#0f1b2d"/><circle cx="4" cy="-4" r="1.8" fill="#0f1b2d"/>
              <circle cx="-4" cy="4" r="1.8" fill="#0f1b2d"/>
              <circle cx="0" cy="9" r="1.8" fill="#0f1b2d"/>
              <circle cx="4" cy="14" r="1.8" fill="#0f1b2d"/>
            </g>
          </svg>
          Polla Dominó
        </Link>

        <Link
          href="/standings"
          className="text-sm text-muted hover:text-foreground"
        >
          Liga
        </Link>

        {isAdmin && (
          <>
            <Link
              href="/players"
              className="text-sm text-muted hover:text-foreground"
            >
              Usuarios
            </Link>
            <Link
              href="/admin"
              className="text-sm text-muted hover:text-foreground"
            >
              Nuevo Torneo
            </Link>
          </>
        )}

        <div className="ml-auto flex items-center gap-3">
          {session ? (
            <>
              <span className="text-xs text-muted">
                {session.email}
                {isAdmin ? (
                  <span className="ml-1.5 inline-block rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
                    Admin
                  </span>
                ) : (
                  <span className="ml-1.5 inline-block rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">
                    Jugador
                  </span>
                )}
              </span>
              <form action={signOut}>
                <button
                  type="submit"
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
                >
                  Cerrar sesión
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-background hover:bg-primary-hover"
            >
              Ingresar
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}