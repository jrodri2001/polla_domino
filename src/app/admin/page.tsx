"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createTournament } from "@/lib/actions";

interface PlayerData {
  id: string;
  name: string;
  email: string;
  tournamentCount: number;
}

export default function NewTournamentPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("players")
      .select("id, name, email, profiles!player_id(id), tournament_players(count)")
      .not("profiles", "is", null)
      .eq("active", true)
      .order("name")
      .then(({ data }) => {
        const mapped: PlayerData[] = (data ?? []).map((p) => ({
          id: p.id as string,
          name: (p.name as string) ?? "",
          email: (p.email as string) ?? "",
          tournamentCount:
            (p.tournament_players as unknown as { count: number }[])?.[0]
              ?.count ?? 0,
        }));
        setPlayers(mapped);
      });
  }, []);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    formData.set("player_ids", JSON.stringify([...selected]));

    const result = await createTournament(formData);
    setLoading(false);

    if (result.error) {
      setError(result.error);
    } else if (result.tournamentId) {
      router.push(`/admin/tournament/${result.tournamentId}`);
    }
  }

  // Derive visible list inline
  const q = search.trim().toLowerCase();
  const visible = players
    .filter((p) => {
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const aS = selected.has(a.id) ? 0 : 1;
      const bS = selected.has(b.id) ? 0 : 1;
      if (aS !== bS) return aS - bS;
      if (b.tournamentCount !== a.tournamentCount)
        return b.tournamentCount - a.tournamentCount;
      return a.name.localeCompare(b.name);
    });

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Nuevo Torneo</h1>

      <form id="tournament-form" onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-muted">
              Nombre del torneo
            </label>
            <input
              name="name"
              required
              placeholder="Domino de los panas"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted">
              Mesas disponibles
            </label>
            <input
              name="table_count"
              type="number"
              min={1}
              defaultValue={1}
              required
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </div>
        </div>
      </form>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <label className="block text-sm text-muted">
            Selecciona jugadores ({selected.size} seleccionados, mínimo 4)
            {q && (
              <span className="ml-2 text-primary">
                — mostrando {visible.length} de {players.length}
              </span>
            )}
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set(visible.map((p) => p.id)))}
              className="text-xs text-primary hover:underline"
            >
              Seleccionar todos
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs text-muted hover:underline"
            >
              Limpiar
            </button>
          </div>
        </div>

        <input
          type="search"
          placeholder="Buscar por nombre o email..."
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
        />

        {players.length === 0 ? (
          <p className="text-sm text-muted">
            No hay jugadores registrados. Invita a los jugadores a crear una
            cuenta en la aplicación.
          </p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted">
            No se encontraron jugadores para &ldquo;{search}&rdquo;
          </p>
        ) : (
          <div key={`grid-${q}`} className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {visible.map((p) => (
              <label
                key={p.id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition ${
                  selected.has(p.id)
                    ? "border-primary bg-primary/10"
                    : "border-border bg-surface hover:bg-surface-hover"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  className="accent-primary"
                />
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{p.name}</span>
                  {p.tournamentCount > 0 && (
                    <span className="ml-1.5 text-xs text-muted">
                      ({p.tournamentCount}T)
                    </span>
                  )}
                  <p className="truncate text-xs text-muted">{p.email}</p>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="submit"
        form="tournament-form"
        disabled={selected.size < 4 || loading}
        className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-background hover:bg-primary-hover disabled:opacity-40"
      >
        {loading ? "Creando..." : "Crear Torneo"}
      </button>
    </div>
  );
}
