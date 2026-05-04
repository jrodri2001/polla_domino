"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { updateTournament } from "@/lib/actions";

interface PlayerData {
  id: string;
  name: string;
  email: string;
  tournamentCount: number;
}

export default function EditTournamentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [tableCount, setTableCount] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    // Fetch tournament details
    supabase
      .from("tournaments")
      .select("name, table_count")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        if (data) {
          setName(data.name);
          setTableCount(data.table_count);
        }
      });

    // Fetch current tournament players to pre-select
    supabase
      .from("tournament_players")
      .select("player_id")
      .eq("tournament_id", id)
      .then(({ data }) => {
        setSelected(new Set((data ?? []).map((r) => r.player_id)));
      });

    // Fetch all registered players
    supabase
      .from("players")
      .select("id, name, email, profiles!player_id(id), tournament_players(count)")
      .not("profiles", "is", null)
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
  }, [id]);

  const toggle = useCallback((pid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await updateTournament(id, name, tableCount, [...selected]);
    setLoading(false);
    if (res.error) {
      setError(res.error);
    } else {
      router.push(`/admin/tournament/${id}`);
    }
  }

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
      <div>
        <button
          type="button"
          onClick={() => router.push(`/admin/tournament/${id}`)}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          Volver al torneo
        </button>
        <h1 className="text-2xl font-bold">Editar Torneo</h1>
      </div>

      <form id="edit-form" onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-muted">
              Nombre del torneo
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Domino de los panas"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted">
              Mesas disponibles
            </label>
            <input
              type="number"
              min={1}
              required
              value={tableCount}
              onChange={(e) => setTableCount(parseInt(e.target.value, 10) || 1)}
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
          <p className="text-sm text-muted">Cargando jugadores...</p>
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
        form="edit-form"
        disabled={selected.size < 4 || loading}
        className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-background hover:bg-primary-hover disabled:opacity-40"
      >
        {loading ? "Guardando..." : "Guardar Cambios"}
      </button>
    </div>
  );
}