"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  generateTournamentSchedule,
  updateGameScore,
  completeTournament,
  renameTournament,
} from "@/lib/actions";
import type { Tournament, Player, Round, Game, Bye } from "@/lib/types";

interface FullRound extends Round {
  games: Game[];
  byes: Bye[];
}

export default function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<Map<string, Player>>(new Map());
  const [playerOrder, setPlayerOrder] = useState<string[]>([]);
  const [rounds, setRounds] = useState<FullRound[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const refreshRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    const sb = createClient();

    async function fetchAll() {
      const { data: t } = await sb
        .from("tournaments")
        .select("*")
        .eq("id", id)
        .single();
      if (!t) return;
      setTournament(t);

      let tp = await sb
        .from("tournament_players")
        .select("player_id, sort_order")
        .eq("tournament_id", id)
        .order("sort_order");
      // Fallback if sort_order column doesn't exist yet
      if (tp.error) {
        tp = await sb
          .from("tournament_players")
          .select("player_id, sort_order")
          .eq("tournament_id", id) as typeof tp;
      }
      const pIds = (tp.data ?? []).map((r) => r.player_id);
      setPlayerOrder(pIds);
      if (pIds.length > 0) {
        const { data: pData } = await sb
          .from("players")
          .select("*")
          .in("id", pIds);
        const map = new Map<string, Player>();
        for (const p of pData ?? []) map.set(p.id, p);
        setPlayers(map);
      }

      const { data: rData } = await sb
        .from("rounds")
        .select("*")
        .eq("tournament_id", id)
        .order("round_number");

      if (rData && rData.length > 0) {
        const roundIds = rData.map((r) => r.id);
        const [{ data: gData }, { data: bData }] = await Promise.all([
          sb.from("games").select("*").in("round_id", roundIds),
          sb.from("byes").select("*").in("round_id", roundIds),
        ]);
        setRounds(
          rData.map((r) => ({
            ...r,
            games: (gData ?? []).filter((g) => g.round_id === r.id),
            byes: (bData ?? []).filter((b) => b.round_id === r.id),
          })),
        );
      } else {
        setRounds([]);
      }
    }

    refreshRef.current = fetchAll;
    fetchAll();

    const channel = sb
      .channel(`tournament-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "games" },
        () => fetchAll(),
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [id]);

  async function handleGenerate() {
    setGenerating(true);
    setError("");
    const res = await generateTournamentSchedule(id);
    if (res.error) setError(res.error);
    await refreshRef.current?.();
    setGenerating(false);
  }

  async function handleComplete() {
    await completeTournament(id);
    await refreshRef.current?.();
  }

  async function handleRename() {
    if (!nameDraft.trim() || nameDraft.trim() === tournament?.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    const res = await renameTournament(id, nameDraft);
    if (res.error) setError(res.error);
    await refreshRef.current?.();
    setSavingName(false);
    setEditingName(false);
  }

  async function handleRegenerate() {
    if (!confirm("Se borrarán todos los emparejamientos actuales y se generarán nuevos. ¿Continuar?")) return;
    await handleGenerate();
  }

  function playerName(pid: string) {
    return players.get(pid)?.name ?? "?";
  }

  function playerNum(pid: string) {
    const idx = playerOrder.indexOf(pid);
    return idx >= 0 ? idx + 1 : "?";
  }

  if (!tournament) {
    return <p className="text-muted">Cargando...</p>;
  }

  const allGames = rounds.flatMap((r) => r.games);
  const completedGames = allGames.filter((g) => g.status === "completed").length;
  const totalGames = allGames.length;
  const hasResults = completedGames > 0;

  return (
    <div className="space-y-8">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") setEditingName(false);
                }}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-2xl font-bold text-foreground focus:border-primary focus:outline-none"
              />
              <button
                onClick={handleRename}
                disabled={savingName}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-background hover:bg-primary-hover disabled:opacity-40"
              >
                {savingName ? "..." : "OK"}
              </button>
              <button
                onClick={() => setEditingName(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-foreground"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{tournament.name}</h1>
              <button
                onClick={() => { setNameDraft(tournament.name); setEditingName(true); }}
                className="rounded p-1 text-muted hover:text-foreground"
                title="Renombrar torneo"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                </svg>
              </button>
            </div>
          )}
          <p className="text-sm text-muted">
            {playerOrder.length} jugadores &middot; {tournament.table_count} mesa
            {tournament.table_count > 1 ? "s" : ""} &middot;{" "}
            {rounds.length} rondas
          </p>
        </div>
        <div className="flex gap-2">
          {tournament.status !== "setup" && (
            <Link
              href={`/leaderboard/${id}`}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface"
            >
              Ver Tabla
            </Link>
          )}
          {rounds.length > 0 && !hasResults && (
            <button
              onClick={handleRegenerate}
              disabled={generating}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted hover:bg-surface hover:text-foreground"
            >
              {generating ? "Regenerando..." : "Regenerar Calendario"}
            </button>
          )}
          {tournament.status === "active" && completedGames === totalGames && totalGames > 0 && (
            <button
              onClick={handleComplete}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background hover:opacity-90"
            >
              Finalizar Torneo
            </button>
          )}
        </div>
      </div>

      {/* ── Player Numbering + Round Pairings ─────────────────────── */}
      {playerOrder.length > 0 && (
        <div className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="font-semibold">Sorteo de Jugadores</h2>
          </div>
          <div className="grid gap-x-6 gap-y-1 px-4 py-3 sm:grid-cols-2 md:grid-cols-3">
            {playerOrder.map((pid, i) => (
              <div key={pid} className="flex items-center gap-2 text-sm">
                <span className="w-6 text-right font-mono text-muted">{i + 1}.</span>
                <span className="font-medium">{playerName(pid)}</span>
              </div>
            ))}
          </div>

          {!hasResults && (
            <div className="border-t border-border px-4 py-3 text-center">
              <Link
                href={`/admin/tournament/${id}/edit-players`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                </svg>
                Editar Torneo
              </Link>
            </div>
          )}

          {rounds.length > 0 && (
            <>
              <div className="border-t border-border px-4 py-3">
                <h3 className="text-sm font-semibold">Emparejamientos por Ronda</h3>
              </div>
              <div className="grid gap-x-6 gap-y-1 px-4 pb-3 sm:grid-cols-2 md:grid-cols-3">
                {rounds.map((round) => (
                  <div key={round.id} className="text-sm">
                    <span className="font-mono text-muted">R{round.round_number}:</span>{" "}
                    {round.games.map((g, gi) => (
                      <span key={g.id}>
                        {gi > 0 && <span className="text-muted"> | </span>}
                        <span className="font-medium">
                          {playerNum(g.team1_player1)}-{playerNum(g.team1_player2)}
                        </span>
                        <span className="text-muted"> vs </span>
                        <span className="font-medium">
                          {playerNum(g.team2_player1)}-{playerNum(g.team2_player2)}
                        </span>
                      </span>
                    ))}
                    {round.byes.length > 0 && (
                      <span className="ml-1 text-xs text-muted">
                        (desc: {round.byes.map((b) => playerNum(b.player_id)).join(",")})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Generate Schedule ────────────────────────────────────────── */}
      {(tournament.status === "setup" || rounds.length === 0) && (
        <div className="rounded-lg border border-border bg-surface p-6 text-center">
          <p className="mb-4 text-muted">
            {playerOrder.length} jugadores seleccionados. Genera los emparejamientos
            para comenzar.
          </p>
          {error && <p className="mb-3 text-sm text-danger">{error}</p>}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-background hover:bg-primary-hover disabled:opacity-40"
          >
            {generating ? "Generando..." : "Generar Calendario"}
          </button>
        </div>
      )}

      {/* ── Progress bar ─────────────────────────────────────────────── */}
      {totalGames > 0 && (
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>Progreso</span>
            <span>{completedGames}/{totalGames} juegos completados</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${(completedGames / totalGames) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Rounds ───────────────────────────────────────────────────── */}
      {rounds.map((round) => (
        <div
          key={round.id}
          className="rounded-lg border border-border bg-surface"
        >
          <div className="border-b border-border px-4 py-3">
            <h2 className="font-semibold">Ronda {round.round_number}</h2>
            {round.byes.length > 0 && (
              <p className="text-xs text-muted">
                Descansan:{" "}
                {round.byes.map((b) => playerName(b.player_id)).join(", ")}
              </p>
            )}
          </div>

          <div className="divide-y divide-border">
            {round.games.map((game) => (
              <GameRow
                key={game.id}
                game={game}
                playerName={playerName}
                onSave={() => refreshRef.current?.()}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Game Row with inline score editing ──────────────────────────────────────

function GameRow({
  game,
  playerName,
  onSave,
}: {
  game: Game;
  playerName: (id: string) => string;
  onSave: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [s1, setS1] = useState(game.team1_score?.toString() ?? "");
  const [s2, setS2] = useState(game.team2_score?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const t1 = parseInt(s1, 10);
    const t2 = parseInt(s2, 10);
    if (isNaN(t1) || isNaN(t2)) return;

    setSaving(true);
    await updateGameScore(game.id, t1, t2);
    setEditing(false);
    setSaving(false);
    onSave();
  }

  const t1Name = `${playerName(game.team1_player1)} & ${playerName(game.team1_player2)}`;
  const t2Name = `${playerName(game.team2_player1)} & ${playerName(game.team2_player2)}`;

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="mr-auto text-xs text-muted">
        Mesa {game.table_number}
      </span>

      {/* Team 1 */}
      <span className="text-sm font-medium">{t1Name}</span>

      {editing ? (
        <>
          <input
            type="number"
            min={0}
            value={s1}
            onChange={(e) => setS1(e.target.value)}
            className="w-16 rounded border border-border bg-background px-2 py-1 text-center text-sm focus:border-primary focus:outline-none"
          />
          <span className="text-muted">-</span>
          <input
            type="number"
            min={0}
            value={s2}
            onChange={(e) => setS2(e.target.value)}
            className="w-16 rounded border border-border bg-background px-2 py-1 text-center text-sm focus:border-primary focus:outline-none"
          />
        </>
      ) : (
        <span
          className={`rounded px-2 py-0.5 text-sm font-mono ${
            game.status === "completed"
              ? "bg-primary/10 text-primary"
              : "bg-surface-hover text-muted"
          }`}
        >
          {game.team1_score ?? "–"} - {game.team2_score ?? "–"}
        </span>
      )}

      {/* Team 2 */}
      <span className="text-sm font-medium">{t2Name}</span>

      {/* Actions */}
      {editing ? (
        <div className="flex gap-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-primary px-3 py-1 text-xs font-medium text-background hover:bg-primary-hover disabled:opacity-40"
          >
            {saving ? "..." : "OK"}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="rounded px-3 py-1 text-xs text-muted hover:text-foreground"
          >
            X
          </button>
        </div>
      ) : (
        <button
          onClick={() => {
            setS1(game.team1_score?.toString() ?? "");
            setS2(game.team2_score?.toString() ?? "");
            setEditing(true);
          }}
          className="rounded border border-border px-3 py-1 text-xs text-muted hover:text-foreground"
        >
          {game.status === "completed" ? "Editar" : "Anotar"}
        </button>
      )}
    </div>
  );
}
