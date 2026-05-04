"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Tournament, Player, Game } from "@/lib/types";
import type { UserRole } from "@/lib/auth";

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
  const [games, setGames] = useState<Game[]>([]);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);

  useEffect(() => {
    const sb = createClient();

    async function fetchAll() {
      // Check user role for conditional UI
      const { data: { user } } = await sb.auth.getUser();
      if (user) {
        const { data: profile } = await sb
          .from("profiles")
          .select("role, player_id")
          .eq("id", user.id)
          .single();
        setUserRole((profile?.role as UserRole) ?? "player");
        setMyPlayerId(profile?.player_id ?? null);
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
          .select("*")
          .in("id", pIds);
        const map = new Map<string, Player>();
        for (const p of pData ?? []) map.set(p.id, p);
        setPlayers(map);
      }

      const { data: rData } = await sb
        .from("rounds")
        .select("id")
        .eq("tournament_id", id);
      if (rData && rData.length > 0) {
        const roundIds = rData.map((r) => r.id);
        const { data: gData } = await sb
          .from("games")
          .select("*")
          .in("round_id", roundIds);
        setGames(gData ?? []);
      }
    }

    fetchAll();

    const channel = sb
      .channel(`leaderboard-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games" },
        () => fetchAll(),
      )
      .subscribe();

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

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-muted">
            <tr>
              <th className="px-4 py-3 text-center font-medium">#</th>
              <th className="px-4 py-3 font-medium">Jugador</th>
              <th className="px-4 py-3 text-center font-medium">PJ</th>
              <th className="px-4 py-3 text-center font-medium">G</th>
              <th className="px-4 py-3 text-center font-medium">P</th>
              <th className="px-4 py-3 text-center font-medium">PF</th>
              <th className="px-4 py-3 text-center font-medium">PC</th>
              <th className="px-4 py-3 text-center font-medium">DIF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {standings.map((s, i) => (
              <tr
                key={s.player.id}
                className={`hover:bg-surface-hover ${s.player.id === myPlayerId ? "bg-accent/10 ring-1 ring-inset ring-accent/30" : i < 2 ? "bg-primary/5" : ""}`}
              >
                <td className="px-4 py-3 text-center font-bold">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </td>
                <td className="px-4 py-3 font-medium">
                  {s.player.name}
                  {s.player.id === myPlayerId && (
                    <span className="ml-1.5 text-xs text-accent">(tú)</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">{s.played}</td>
                <td className="px-4 py-3 text-center font-semibold text-primary">
                  {s.wins}
                </td>
                <td className="px-4 py-3 text-center text-danger">{s.losses}</td>
                <td className="px-4 py-3 text-center">{s.pf}</td>
                <td className="px-4 py-3 text-center">{s.pa}</td>
                <td
                  className={`px-4 py-3 text-center font-mono font-semibold ${
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
    </div>
  );
}
