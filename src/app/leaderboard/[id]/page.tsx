"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Tournament, Player, Game, Bye, Round, UserRole } from "@/lib/types";

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
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);

  useEffect(() => {
    const sb = createClient();

    async function fetchAll() {
      // Check user role for conditional UI
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
      );

    async function init() {
      await sb.auth.getUser();
      await fetchAll();
      channel.subscribe();
    }

    init();

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
                {rGames.map((g) => {
                  const done = g.status === "completed";
                  const t1Won = done && g.team1_score != null && g.team2_score != null && g.team1_score > g.team2_score;
                  const t2Won = done && g.team1_score != null && g.team2_score != null && g.team2_score > g.team1_score;
                  return (
                    <div key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                      <span className={`flex-1 text-right ${t1Won ? "font-semibold text-primary" : ""}`}>
                        {playerName(g.team1_player1)} & {playerName(g.team1_player2)}
                      </span>
                      {done ? (
                        <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                          {g.team1_score} - {g.team2_score}
                        </span>
                      ) : (
                        <span className="rounded bg-surface-hover px-2 py-0.5 text-xs text-muted">vs</span>
                      )}
                      <span className={`flex-1 ${t2Won ? "font-semibold text-primary" : ""}`}>
                        {playerName(g.team2_player1)} & {playerName(g.team2_player2)}
                      </span>
                    </div>
                  );
                })}
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
                {rGames.map((g) => {
                  const t1Won = g.team1_score != null && g.team2_score != null && g.team1_score > g.team2_score;
                  const t2Won = g.team1_score != null && g.team2_score != null && g.team2_score > g.team1_score;
                  return (
                    <div key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                      <span className={`flex-1 text-right ${t1Won ? "font-semibold text-primary" : ""}`}>
                        {playerName(g.team1_player1)} & {playerName(g.team1_player2)}
                      </span>
                      <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                        {g.team1_score} - {g.team2_score}
                      </span>
                      <span className={`flex-1 ${t2Won ? "font-semibold text-primary" : ""}`}>
                        {playerName(g.team2_player1)} & {playerName(g.team2_player2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
