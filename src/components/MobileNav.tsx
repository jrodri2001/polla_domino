"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "@/lib/actions/auth";

interface MobileNavProps {
  links: { href: string; label: string }[];
  email?: string;
  isAdmin: boolean;
  isLoggedIn: boolean;
}

export default function MobileNav({
  links,
  email,
  isAdmin,
  isLoggedIn,
}: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="sm:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-lg p-1.5 text-muted hover:text-foreground"
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
      >
        {open ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="h-5 w-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="h-5 w-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
            />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-14 z-50 border-b border-border bg-surface shadow-lg">
          <div className="mx-auto max-w-5xl px-4 py-3">
            <div className="space-y-1">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-surface-hover"
                >
                  {link.label}
                </Link>
              ))}
            </div>
            {isLoggedIn && (
              <>
                <div className="my-2 border-t border-border" />
                <p className="px-3 py-1.5 text-xs text-muted">
                  {email}
                  {isAdmin ? (
                    <span className="ml-1.5 inline-block rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
                      Admin
                    </span>
                  ) : (
                    <span className="ml-1.5 inline-block rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">
                      Jugador
                    </span>
                  )}
                </p>
                <form action={signOut}>
                  <button
                    type="submit"
                    onClick={() => setOpen(false)}
                    className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-danger hover:bg-surface-hover"
                  >
                    Cerrar sesión
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}