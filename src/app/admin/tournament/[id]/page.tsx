"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  generateTournamentSchedule,
  addHandScore,
  updateHandScore,
  removeLastHand,
  updateGameScore,
  resetGameScore,
  setSalidor,
  completeTournament,
  renameTournament,
} from "@/lib/actions";
import type { Tournament, Player, Round, Game, Bye, Hand } from "@/lib/types";

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
  const [handsMap, setHandsMap] = useState<Map<string, Hand[]>>(new Map());
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
          .select("id, name, email, active, auth_id, role, created_at")
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
        const allGames = gData ?? [];
        setRounds(
          rData.map((r) => ({
            ...r,
            games: allGames.filter((g) => g.round_id === r.id),
            byes: (bData ?? []).filter((b) => b.round_id === r.id),
          })),
        );

        // Fetch hands for all games
        if (allGames.length > 0) {
          const gameIds = allGames.map((g) => g.id);
          const { data: hData } = await sb
            .from("hands")
            .select("*")
            .in("game_id", gameIds)
            .order("hand_number");
          const hMap = new Map<string, Hand[]>();
          for (const h of hData ?? []) {
            const arr = hMap.get(h.game_id) ?? [];
            arr.push(h);
            hMap.set(h.game_id, arr);
          }
          setHandsMap(hMap);
        } else {
          setHandsMap(new Map());
        }
      } else {
        setRounds([]);
        setHandsMap(new Map());
      }
    }

    refreshRef.current = fetchAll;
    fetchAll();

    const channel = sb
      .channel(`tournament-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games" },
        () => fetchAll(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "hands" },
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
        <div className="flex flex-wrap gap-2">
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
                hands={handsMap.get(game.id) ?? []}
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

// ── Game Row — collapsible card with hand-by-hand + direct scoring ──────────

function GameRow({
  game,
  hands,
  playerName,
  onSave,
}: {
  game: Game;
  hands: Hand[];
  playerName: (id: string) => string;
  onSave: () => void;
}) {
  const [expanded, setExpanded] = useState(game.status === "in_progress");
  // Hand-by-hand inputs
  const [s1, setS1] = useState("");
  const [s2, setS2] = useState("");
  const [saving, setSaving] = useState(false);
  const [undoing, setUndoing] = useState(false);
  // Final score inputs
  const [f1, setF1] = useState("");
  const [f2, setF2] = useState("");
  const [savingFinal, setSavingFinal] = useState(false);

  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");
  const [savingSalidor, setSavingSalidor] = useState(false);

  const total1 = game.team1_score ?? 0;
  const total2 = game.team2_score ?? 0;
  const isDone = game.status === "completed";
  const hasHands = hands.length > 0;

  async function handleSalidorClick(pid: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (savingSalidor || isDone) return;
    setSavingSalidor(true);
    await setSalidor(game.id, game.salidor_player_id === pid ? null : pid);
    setSavingSalidor(false);
    onSave();
  }

  function renderName(pid: string, winHighlight: boolean) {
    const isSalidor = game.salidor_player_id === pid;
    const canClick = !isDone && !savingSalidor;
    return (
      <span
        key={pid}
        onClick={canClick ? (ev: React.MouseEvent) => handleSalidorClick(pid, ev) : undefined}
        className={[
          canClick ? "cursor-pointer hover:text-accent" : "",
          isSalidor ? "underline decoration-amber-400 decoration-2 underline-offset-4" : "",
          winHighlight ? "text-primary" : "",
        ].filter(Boolean).join(" ")}
        title={canClick ? (isSalidor ? "Quitar como salidor" : "Marcar como salidor") : undefined}
      >
        {playerName(pid)}
      </span>
    );
  }

  async function handleAddHand() {
    if (s1 === "" && s2 === "") return;
    const p1 = parseInt(s1, 10) || 0;
    const p2 = parseInt(s2, 10) || 0;
    setSaving(true);
    setError("");
    const res = await addHandScore(game.id, p1, p2);
    if (res.error) setError(res.error);
    setS1("");
    setS2("");
    setSaving(false);
    onSave();
  }

  async function handleUndo() {
    setUndoing(true);
    setError("");
    const res = await removeLastHand(game.id);
    if (res.error) setError(res.error);
    setUndoing(false);
    onSave();
  }

  async function handleFinalScore() {
    const v1 = parseInt(f1, 10);
    const v2 = parseInt(f2, 10);
    if (isNaN(v1) || isNaN(v2)) return;
    if (hasHands && !confirm("Esto reemplazará las manos registradas con el resultado final. ¿Continuar?")) return;
    setSavingFinal(true);
    setError("");
    const res = await updateGameScore(game.id, v1, v2);
    if (res.error) setError(res.error);
    setF1("");
    setF2("");
    setSavingFinal(false);
    onSave();
  }

  return (
    <div>
      {/* ── Clickable header (always visible) ──────────────────────── */}
      <div
        className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left hover:bg-surface-hover/50"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Mesa {game.table_number}</span>
            {isDone && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                Completado
              </span>
            )}
            {game.status === "in_progress" && (
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                En juego · {hands.length} mano{hands.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm sm:gap-3">
            <span className="min-w-0 flex-1 text-right font-medium">
              {renderName(game.team1_player1, isDone && total1 > total2)}{" & "}
              {renderName(game.team1_player2, isDone && total1 > total2)}
            </span>
            <span
              className={`shrink-0 rounded px-2.5 py-0.5 font-mono text-sm font-semibold ${
                isDone
                  ? "bg-primary/10 text-primary"
                  : hasHands
                    ? "bg-accent/10 text-accent"
                    : "bg-surface-hover text-muted"
              }`}
            >
              {total1} - {total2}
            </span>
            <span className="min-w-0 flex-1 font-medium">
              {renderName(game.team2_player1, isDone && total2 > total1)}{" & "}
              {renderName(game.team2_player2, isDone && total2 > total1)}
            </span>
          </div>
        </div>
        {/* Chevron */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`mt-1 h-4 w-4 shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </div>

      {/* ── Collapsible body ───────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-border/50 px-4 pb-4 pt-3">
          {/* Salidor hint */}
          {!isDone && !game.salidor_player_id && (
            <p className="mb-3 text-xs text-muted">
              Toca un nombre para marcar el salidor
            </p>
          )}

          {/* Hand history with inline editing */}
          {hasHands && (
            <div className="mb-3 space-y-1">
              {hands.map((h) => (
                <HandRow key={h.id} hand={h} onSave={onSave} />
              ))}
            </div>
          )}

          {/* ── Scoring controls (game not done) ──────────────────── */}
          {!isDone && (
            <>
              {/* Add hand */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                <input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={s1}
                  onChange={(e) => { setS1(e.target.value); if (parseInt(e.target.value, 10) > 0) setS2(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleAddHand()}
                  className="w-16 rounded border border-border bg-background px-2 py-1.5 text-center text-sm focus:border-primary focus:outline-none"
                />
                <span className="text-xs text-muted">-</span>
                <input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={s2}
                  onChange={(e) => { setS2(e.target.value); if (parseInt(e.target.value, 10) > 0) setS1(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleAddHand()}
                  className="w-16 rounded border border-border bg-background px-2 py-1.5 text-center text-sm focus:border-primary focus:outline-none"
                />
                <button
                  onClick={handleAddHand}
                  disabled={saving}
                  className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-background hover:bg-primary-hover disabled:opacity-40"
                >
                  {saving ? "..." : "+ Mano"}
                </button>
                {hasHands && (
                  <button
                    onClick={handleUndo}
                    disabled={undoing}
                    className="rounded border border-border px-2 py-1.5 text-xs text-muted hover:border-danger hover:text-danger disabled:opacity-40"
                    title="Deshacer última mano"
                  >
                    {undoing ? "..." : "↩"}
                  </button>
                )}
              </div>

              {/* Separator */}
              <div className="my-3 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] uppercase tracking-wider text-muted">o resultado final</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {/* Direct final score */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                <input
                  type="number"
                  min={0}
                  placeholder="Eq. 1"
                  value={f1}
                  onChange={(e) => setF1(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleFinalScore()}
                  className="w-20 rounded border border-border bg-background px-2 py-1.5 text-center text-sm focus:border-primary focus:outline-none"
                />
                <span className="text-xs text-muted">-</span>
                <input
                  type="number"
                  min={0}
                  placeholder="Eq. 2"
                  value={f2}
                  onChange={(e) => setF2(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleFinalScore()}
                  className="w-20 rounded border border-border bg-background px-2 py-1.5 text-center text-sm focus:border-primary focus:outline-none"
                />
                <button
                  onClick={handleFinalScore}
                  disabled={savingFinal}
                  className="rounded border border-border px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-hover hover:text-foreground disabled:opacity-40"
                >
                  {savingFinal ? "..." : "Guardar Final"}
                </button>
              </div>
            </>
          )}

          {/* ── Undo / revert on completed game ─────────────────── */}
          {isDone && hasHands && (
            <div className="mt-1 text-center">
              <button
                onClick={handleUndo}
                disabled={undoing}
                className="text-xs text-muted hover:text-danger disabled:opacity-40"
              >
                {undoing ? "Deshaciendo..." : "↩ Deshacer última mano"}
              </button>
            </div>
          )}
          {isDone && !hasHands && (
            <div className="text-center">
              <button
                onClick={async () => {
                  setResetting(true);
                  setError("");
                  const res = await resetGameScore(game.id);
                  if (res.error) setError(res.error);
                  setResetting(false);
                  onSave();
                }}
                disabled={resetting}
                className="text-xs text-muted hover:text-danger disabled:opacity-40"
              >
                {resetting ? "Revirtiendo..." : "↩ Revertir resultado"}
              </button>
            </div>
          )}

          {error && <p className="mt-2 text-center text-xs text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}

// ── Individual hand row with inline editing ─────────────────────────────────

function HandRow({
  hand,
  onSave,
}: {
  hand: Hand;
  onSave: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [p1, setP1] = useState(hand.team1_points.toString());
  const [p2, setP2] = useState(hand.team2_points.toString());
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const v1 = parseInt(p1, 10) || 0;
    const v2 = parseInt(p2, 10) || 0;
    setSaving(true);
    await updateHandScore(hand.id, v1, v2);
    setEditing(false);
    setSaving(false);
    onSave();
  }

  if (editing) {
    return (
      <div className="flex items-center justify-center gap-2 text-xs">
        <span className="w-8 text-right font-mono text-muted">M{hand.hand_number}</span>
        <input
          type="number"
          min={0}
          value={p1}
          onChange={(e) => { setP1(e.target.value); if (parseInt(e.target.value, 10) > 0) setP2("0"); }}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          autoFocus
          className="w-14 rounded border border-primary bg-background px-1.5 py-1 text-center font-mono focus:outline-none"
        />
        <input
          type="number"
          min={0}
          value={p2}
          onChange={(e) => { setP2(e.target.value); if (parseInt(e.target.value, 10) > 0) setP1("0"); }}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          className="w-14 rounded border border-primary bg-background px-1.5 py-1 text-center font-mono focus:outline-none"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-primary px-2 py-1 text-xs font-medium text-background disabled:opacity-40"
        >
          {saving ? "..." : "✓"}
        </button>
        <button
          onClick={() => {
            setP1(hand.team1_points.toString());
            setP2(hand.team2_points.toString());
            setEditing(false);
          }}
          className="rounded px-2 py-1 text-xs text-muted hover:text-foreground"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="group flex items-center justify-center gap-4 text-xs text-muted">
      <span className="w-8 text-right font-mono">M{hand.hand_number}</span>
      <span className={`w-10 text-right font-mono ${hand.team1_points > 0 ? "font-semibold text-foreground" : ""}`}>
        +{hand.team1_points}
      </span>
      <span className={`w-10 font-mono ${hand.team2_points > 0 ? "font-semibold text-foreground" : ""}`}>
        +{hand.team2_points}
      </span>
      <button
        onClick={() => setEditing(true)}
        className="invisible rounded p-0.5 text-muted hover:text-foreground group-hover:visible"
        title="Editar mano"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
          <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L3.22 10.303a1 1 0 0 0-.26.442l-.782 2.86a.25.25 0 0 0 .305.305l2.86-.782a1 1 0 0 0 .442-.26l7.79-7.793a1.75 1.75 0 0 0 0-2.475l-.087-.087Z" />
        </svg>
      </button>
    </div>
  );
}
