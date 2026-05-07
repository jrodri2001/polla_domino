import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import type { Player } from "@/lib/types";

export const dynamic = "force-dynamic";

interface AllTimeStats {
  player: Player;
  tournaments: number;
  played: number;
  wins: number;
  losses: number;
  winRate: number;
  pf: number;
  pa: number;
  diff: number;
}

export default async function StandingsPage() {
  const session = await getSession();
  const myPlayerId = session?.playerId ?? null;
  let standings: AllTimeStats[] = [];
  let dbError = "";

  try {
    const supabase = await createClient();

    const [{ data: players, error: pErr }, { data: games, error: gErr }] =
      await Promise.all([
        supabase
          .from("players")
          .select("*")
          .not("auth_id", "is", null),
        supabase
          .from("games")
          .select("*, round:rounds(tournament_id)")
          .eq("status", "completed"),
      ]);

    if (pErr) dbError = pErr.message;
    if (gErr) dbError = gErr.message;

    if (players && games) {
      const map = new Map<string, AllTimeStats>();
      for (const p of players) {
        map.set(p.id, {
          player: p,
          tournaments: 0,
          played: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
          pf: 0,
          pa: 0,
          diff: 0,
        });
      }

      // Track which tournaments each player participated in
      const playerTournaments = new Map<string, Set<string>>();

      for (const g of games) {
        if (g.team1_score == null || g.team2_score == null) continue;

        const tournamentId = (
          g.round as unknown as { tournament_id: string }
        )?.tournament_id;
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
          if (tournamentId) {
            let set = playerTournaments.get(pid);
            if (!set) {
              set = new Set();
              playerTournaments.set(pid, set);
            }
            set.add(tournamentId);
          }
        }
        for (const pid of team2) {
          const s = map.get(pid);
          if (!s) continue;
          s.played++;
          s.pf += g.team2_score;
          s.pa += g.team1_score;
          if (!t1Won) s.wins++;
          else s.losses++;
          if (tournamentId) {
            let set = playerTournaments.get(pid);
            if (!set) {
              set = new Set();
              playerTournaments.set(pid, set);
            }
            set.add(tournamentId);
          }
        }
      }

      for (const [pid, s] of map) {
        s.diff = s.pf - s.pa;
        s.winRate = s.played > 0 ? s.wins / s.played : 0;
        s.tournaments = playerTournaments.get(pid)?.size ?? 0;
      }

      standings = [...map.values()]
        .filter((s) => s.played > 0)
        .sort(
          (a, b) =>
            b.wins - a.wins ||
            b.winRate - a.winRate ||
            b.diff - a.diff ||
            b.pf - a.pf,
        );
    }
  } catch {
    dbError =
      "No se pudo conectar a Supabase. Verifica tu configuración en .env.local.";
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Liga All-Time</h1>
        <p className="text-sm text-muted">
          Ranking global acumulado de todos los torneos.
        </p>
      </div>

      {dbError && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {dbError}
        </div>
      )}

      {standings.length === 0 && !dbError ? (
        <div className="rounded-lg border border-border bg-surface p-12 text-center">
          <p className="text-muted">
            No hay resultados todavía. Completa juegos en un torneo para ver el
            ranking.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-muted">
              <tr>
                <th className="px-4 py-3 text-center font-medium">#</th>
                <th className="px-4 py-3 font-medium">Jugador</th>
                <th className="px-4 py-3 text-center font-medium">T</th>
                <th className="px-4 py-3 text-center font-medium">PJ</th>
                <th className="px-4 py-3 text-center font-medium">G</th>
                <th className="px-4 py-3 text-center font-medium">P</th>
                <th className="px-4 py-3 text-center font-medium">%G</th>
                <th className="px-4 py-3 text-center font-medium">PF</th>
                <th className="px-4 py-3 text-center font-medium">PC</th>
                <th className="px-4 py-3 text-center font-medium">DIF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {standings.map((s, i) => (
                <tr
                  key={s.player.id}
                  className={`hover:bg-surface-hover ${!s.player.active ? "opacity-50" : ""} ${s.player.id === myPlayerId ? "bg-accent/10 ring-1 ring-inset ring-accent/30" : i < 3 ? "bg-primary/5" : ""}`}
                >
                  <td className="px-4 py-3 text-center font-bold">
                    {i === 0
                      ? "🥇"
                      : i === 1
                        ? "🥈"
                        : i === 2
                          ? "🥉"
                          : i + 1}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {s.player.name}
                    {!s.player.active && (
                      <span className="ml-1.5 text-xs text-danger">(inactivo)</span>
                    )}
                    {s.player.id === myPlayerId && (
                      <span className="ml-1.5 text-xs text-accent">(tú)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-muted">
                    {s.tournaments}
                  </td>
                  <td className="px-4 py-3 text-center">{s.played}</td>
                  <td className="px-4 py-3 text-center font-semibold text-primary">
                    {s.wins}
                  </td>
                  <td className="px-4 py-3 text-center text-danger">
                    {s.losses}
                  </td>
                  <td className="px-4 py-3 text-center font-mono">
                    {(s.winRate * 100).toFixed(0)}%
                  </td>
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
      )}

      {/* Column legend */}
      {standings.length > 0 && (
        <p className="text-xs text-muted">
          T = Torneos &middot; PJ = Partidos jugados &middot; G = Ganados
          &middot; P = Perdidos &middot; %G = Porcentaje de victorias &middot;
          PF = Puntos a favor &middot; PC = Puntos en contra &middot; DIF =
          Diferencial
        </p>
      )}
    </div>
  );
}
