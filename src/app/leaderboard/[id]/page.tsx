"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Tournament, Player, Game, Bye, Round, UserRole, Hand } from "@/lib/types";

interface Standing {
  player: Player;
  wins: number;
  losses: number;
  played: number;
  pf: number;
  pa: number;
  diff: number;
}

export default function LeaderboardPage() {
  const { id } = useParams<{ id: string }>();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<Map<string, Player>>(new Map());
  const [rounds, setRounds] = useState<Round[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [byes, setByes] = useState<Bye[]>([]);
  const [handsMap, setHandsMap] = useState<Map<string, Hand[]>>(new Map());
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);

  useEffect(() => {
    const sb = createClient();
    let authDone = false;

    async function fetchAll() {
      // Check user role once — skip on realtime re-fetches
      if (!authDone) {
        const { data: { user } } = await sb.auth.getUser();
        if (user) {
          const { data: me } = await sb
            .from("players")
            .select("id, role")
            .eq("auth_id", user.id)
            .single();
          setUserRole((me?.role as UserRole) ?? "player");
          setMyPlayerId(me?.id ?? null);
        }
        authDone = true;
      }

      const { data: t } = await sb
        .from("tournaments")
        .select("*")
        .eq("id", id)
        .single();
      if (!t) return;
      setTournament(t);

      const { data: tp } = await sb
        .from("tournament_players")
        .select("player_id")
        .eq("tournament_id", id);
      const pIds = (tp ?? []).map((r) => r.player_id);
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
        .select("id, tournament_id, round_number")
        .eq("tournament_id", id)
        .order("round_number");
      setRounds(rData ?? []);
      if (rData && rData.length > 0) {
        const roundIds = rData.map((r) => r.id);
        const [{ data: gData }, { data: bData }] = await Promise.all([
          sb.from("games").select("*").in("round_id", roundIds),
          sb.from("byes").select("*").in("round_id", roundIds),
        ]);
        setGames(gData ?? []);
        setByes(bData ?? []);

        // Fetch hands for all games
        const allGames = gData ?? [];
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
      }
    }

    const channelName = `leaderboard-${id}`;
    // Remove any stale channel from a previous mount (singleton client persists channels)
    const existing = sb.getChannels().find((c) => c.topic === `realtime:${channelName}`);
    if (existing) sb.removeChannel(existing);

    const channel = sb
      .channel(channelName)
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

    fetchAll();

    return () => {
      sb.removeChannel(channel);
    };
  }, [id]);

  // ── Compute standings ────────────────────────────────────────────────────
  const standings: Standing[] = useMemo(() => {
    const map = new Map<string, Standing>();
    for (const [pid, player] of players) {
      map.set(pid, { player, wins: 0, losses: 0, played: 0, pf: 0, pa: 0, diff: 0 });
    }

    for (const g of games) {
      if (g.status !== "completed" || g.team1_score == null || g.team2_score == null)
        continue;

      const t1Won = g.team1_score > g.team2_score;
      const team1 = [g.team1_player1, g.team1_player2];
      const team2 = [g.team2_player1, g.team2_player2];

      for (const pid of team1) {
        const s = map.get(pid);
        if (!s) continue;
        s.played++;
        s.pf += g.team1_score;
        s.pa += g.team2_score;
        if (t1Won) s.wins++;
        else s.losses++;
      }
      for (const pid of team2) {
        const s = map.get(pid);
        if (!s) continue;
        s.played++;
        s.pf += g.team2_score;
        s.pa += g.team1_score;
        if (!t1Won) s.wins++;
        else s.losses++;
      }
    }

    const arr = [...map.values()];
    for (const s of arr) s.diff = s.pf - s.pa;
    arr.sort((a, b) => b.wins - a.wins || b.diff - a.diff || b.pf - a.pf);
    return arr;
  }, [players, games]);

  // ── Group games by round ───────────────────────────────────────────────
  const roundMap = useMemo(() => {
    const map = new Map<string, { round: Round; games: Game[]; byes: Bye[] }>();
    for (const r of rounds) {
      map.set(r.id, { round: r, games: [], byes: [] });
    }
    for (const g of games) {
      map.get(g.round_id)?.games.push(g);
    }
    for (const b of byes) {
      map.get(b.round_id)?.byes.push(b);
    }
    return [...map.values()].sort((a, b) => a.round.round_number - b.round.round_number);
  }, [rounds, games, byes]);

  const completedRounds = roundMap.filter((r) =>
    r.games.length > 0 && r.games.every((g) => g.status === "completed"),
  );
  const pendingRounds = roundMap.filter((r) =>
    r.games.some((g) => g.status !== "completed"),
  );

  const totalGames = games.length;
  const completedGames = games.filter((g) => g.status === "completed").length;

  function playerName(pid: string) {
    return players.get(pid)?.name ?? "?";
  }

  if (!tournament) return <p className="text-muted">Cargando...</p>;

  const statusLabel: Record<string, string> = {
    setup: "Configurando",
    active: "En Juego",
    completed: "Finalizado",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{tournament.name}</h1>
          <p className="text-sm text-muted">
            Tabla de posiciones &middot;{" "}
            <span
              className={
                tournament.status === "active" ? "text-primary" : "text-muted"
              }
            >
              {statusLabel[tournament.status]}
            </span>
          </p>
        </div>
        {userRole === "admin" && (
          <Link
            href={`/admin/tournament/${id}`}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface"
          >
            Administrar
          </Link>
        )}
      </div>

      {tournament.status === "active" && (
        <p className="flex items-center gap-2 text-xs text-primary">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          Actualización en tiempo real
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[500px] text-sm">
          <thead className="bg-surface text-left text-muted">
            <tr>
              <th className="px-3 py-3 text-center font-medium sm:px-4">#</th>
              <th className="px-3 py-3 font-medium sm:px-4">Jugador</th>
              <th className="px-3 py-3 text-center font-medium sm:px-4">PJ</th>
              <th className="px-3 py-3 text-center font-medium sm:px-4">G</th>
              <th className="px-3 py-3 text-center font-medium sm:px-4">P</th>
              <th className="px-3 py-3 text-center font-medium sm:px-4">PF</th>
              <th className="px-3 py-3 text-center font-medium sm:px-4">PC</th>
              <th className="px-3 py-3 text-center font-medium sm:px-4">DIF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {standings.map((s, i) => (
              <tr
                key={s.player.id}
                className={`hover:bg-surface-hover ${!s.player.active ? "opacity-50" : ""} ${s.player.id === myPlayerId ? "bg-accent/10 ring-1 ring-inset ring-accent/30" : i < 2 ? "bg-primary/5" : ""}`}
              >
                <td className="px-3 py-3 text-center font-bold sm:px-4">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </td>
                <td className="whitespace-nowrap px-3 py-3 font-medium sm:px-4">
                  {s.player.name}
                  {!s.player.active && (
                    <span className="ml-1.5 text-xs text-danger">(inactivo)</span>
                  )}
                  {s.player.id === myPlayerId && (
                    <span className="ml-1.5 text-xs text-accent">(tú)</span>
                  )}
                </td>
                <td className="px-3 py-3 text-center sm:px-4">{s.played}</td>
                <td className="px-3 py-3 text-center font-semibold text-primary sm:px-4">
                  {s.wins}
                </td>
                <td className="px-3 py-3 text-center text-danger sm:px-4">{s.losses}</td>
                <td className="px-3 py-3 text-center sm:px-4">{s.pf}</td>
                <td className="px-3 py-3 text-center sm:px-4">{s.pa}</td>
                <td
                  className={`px-3 py-3 text-center font-mono font-semibold sm:px-4 ${
                    s.diff > 0
                      ? "text-primary"
                      : s.diff < 0
                        ? "text-danger"
                        : "text-muted"
                  }`}
                >
                  {s.diff > 0 ? `+${s.diff}` : s.diff}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Progress ──────────────────────────────────────────────── */}
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

      {/* ── Pending games ─────────────────────────────────────────── */}
      {pendingRounds.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold">Juegos Pendientes</h2>
          {pendingRounds.map(({ round, games: rGames, byes: rByes }) => (
            <div key={round.id} className="rounded-lg border border-border bg-surface">
              <div className="border-b border-border px-4 py-2.5">
                <h3 className="text-sm font-semibold">Ronda {round.round_number}</h3>
                {rByes.length > 0 && (
                  <p className="text-xs text-muted">
                    Descansan: {rByes.map((b) => playerName(b.player_id)).join(", ")}
                  </p>
                )}
              </div>
              <div className="divide-y divide-border">
                {rGames.map((g) => (
                  <LeaderboardGameRow
                    key={g.id}
                    game={g}
                    hands={handsMap.get(g.id) ?? []}
                    playerName={playerName}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Completed results ─────────────────────────────────────── */}
      {completedRounds.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold">Resultados</h2>
          {[...completedRounds].reverse().map(({ round, games: rGames, byes: rByes }) => (
            <div key={round.id} className="rounded-lg border border-border bg-surface">
              <div className="border-b border-border px-4 py-2.5">
                <h3 className="text-sm font-semibold">Ronda {round.round_number}</h3>
                {rByes.length > 0 && (
                  <p className="text-xs text-muted">
                    Descansaron: {rByes.map((b) => playerName(b.player_id)).join(", ")}
                  </p>
                )}
              </div>
              <div className="divide-y divide-border">
                {rGames.map((g) => (
                  <LeaderboardGameRow
                    key={g.id}
                    game={g}
                    hands={handsMap.get(g.id) ?? []}
                    playerName={playerName}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Game row for player view (mirrors admin GameRow, read-only) ─────────────

function LeaderboardGameRow({
  game,
  hands,
  playerName,
}: {
  game: Game;
  hands: Hand[];
  playerName: (id: string) => string;
}) {
  const [expanded, setExpanded] = useState(game.status === "in_progress");
  const done = game.status === "completed";
  const hasHands = hands.length > 0;
  const total1 = game.team1_score ?? 0;
  const total2 = game.team2_score ?? 0;

  function renderName(pid: string, winHighlight: boolean) {
    const isSalidor = game.salidor_player_id === pid;
    return (
      <span
        className={[
          isSalidor ? "underline decoration-amber-400 decoration-2 underline-offset-4" : "",
          winHighlight ? "text-primary" : "",
        ].filter(Boolean).join(" ") || undefined}
      >
        {playerName(pid)}
      </span>
    );
  }

  return (
    <div>
      {/* ── Clickable header (matches admin layout) ───────────────── */}
      <div
        className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left hover:bg-surface-hover/50"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Mesa {game.table_number}</span>
            {done && (
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
              {renderName(game.team1_player1, done && total1 > total2)}{" & "}
              {renderName(game.team1_player2, done && total1 > total2)}
            </span>
            <span
              className={`shrink-0 rounded px-2.5 py-0.5 font-mono text-sm font-semibold ${
                done
                  ? "bg-primary/10 text-primary"
                  : hasHands
                    ? "bg-accent/10 text-accent"
                    : "bg-surface-hover text-muted"
              }`}
            >
              {total1} - {total2}
            </span>
            <span className="min-w-0 flex-1 font-medium">
              {renderName(game.team2_player1, done && total2 > total1)}{" & "}
              {renderName(game.team2_player2, done && total2 > total1)}
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

      {/* ── Collapsible body (read-only hand history) ─────────────── */}
      {expanded && hasHands && (
        <div className="border-t border-border/50 px-4 pb-3 pt-2">
          <div className="space-y-1">
            {hands.map((h) => (
              <div key={h.id} className="flex items-center justify-center gap-4 text-xs text-muted">
                <span className="w-8 text-right font-mono">M{h.hand_number}</span>
                <span className={`w-10 text-right font-mono ${h.team1_points > 0 ? "font-semibold text-foreground" : ""}`}>
                  +{h.team1_points}
                </span>
                <span className={`w-10 font-mono ${h.team2_points > 0 ? "font-semibold text-foreground" : ""}`}>
                  +{h.team2_points}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
