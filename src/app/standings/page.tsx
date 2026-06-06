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
  gameDiff: number;
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

  let totalGames = 0;
  let totalPoints = 0;
  let totalTournaments = 0;
  let totalZapatos = 0;
  let totalChancletas = 0;

  let bestOffense: { player: Player; value: number } | null = null;
  let bestDefense: { player: Player; value: number } | null = null;
  let mostDominant: { player: Player; value: number } | null = null;
  let mostActive: { player: Player; value: number } | null = null;

  let mostZapatosGiven: { players: Player[]; value: number } | null = null;
  let mostZapatosReceived: { players: Player[]; value: number } | null = null;

  try {
    const supabase = await createClient();

    const [
      { data: players, error: pErr },
      { data: games, error: gErr },
      { data: hands, error: hErr },
    ] = await Promise.all([
      supabase
        .from("players")
        .select("*")
        .not("auth_id", "is", null),
      supabase
        .from("games")
        .select("*, round:rounds(tournament_id)")
        .eq("status", "completed"),
      supabase
        .from("hands")
        .select("*"),
    ]);

    if (pErr) dbError = pErr.message;
    if (gErr) dbError = gErr.message;
    if (hErr) dbError = hErr.message;

    if (players && games) {
      const map = new Map<string, AllTimeStats>();
      const playerExtraStats = new Map<string, {
        zapatosGiven: number;
        zapatosReceived: number;
        chancletasGiven: number;
        chancletasReceived: number;
      }>();

      for (const p of players) {
        map.set(p.id, {
          player: p,
          tournaments: 0,
          played: 0,
          wins: 0,
          losses: 0,
          gameDiff: 0,
          winRate: 0,
          pf: 0,
          pa: 0,
          diff: 0,
        });
        playerExtraStats.set(p.id, {
          zapatosGiven: 0,
          zapatosReceived: 0,
          chancletasGiven: 0,
          chancletasReceived: 0,
        });
      }

      // Group hands by game_id
      const handsByGame = new Map<string, typeof hands>();
      if (hands) {
        for (const h of hands) {
          let list = handsByGame.get(h.game_id);
          if (!list) {
            list = [];
            handsByGame.set(h.game_id, list);
          }
          list.push(h);
        }
      }

      // Track which tournaments each player participated in
      const playerTournaments = new Map<string, Set<string>>();
      const tournamentIds = new Set<string>();

      for (const g of games) {
        if (g.team1_score == null || g.team2_score == null) continue;

        totalGames++;
        totalPoints += g.team1_score + g.team2_score;

        const tournamentId = (
          g.round as unknown as { tournament_id: string }
        )?.tournament_id;
        if (tournamentId) {
          tournamentIds.add(tournamentId);
        }

        const t1Won = g.team1_score > g.team2_score;
        const team1 = [g.team1_player1, g.team1_player2];
        const team2 = [g.team2_player1, g.team2_player2];

        // Check for Zapato
        const isZapato = g.team1_score === 0 || g.team2_score === 0;
        if (isZapato) {
          totalZapatos++;
          if (g.team1_score === 0) {
            // Team 2 won, Team 1 got Zapato
            for (const pid of team2) {
              const stats = playerExtraStats.get(pid);
              if (stats) stats.zapatosGiven++;
            }
            for (const pid of team1) {
              const stats = playerExtraStats.get(pid);
              if (stats) stats.zapatosReceived++;
            }
          } else {
            // Team 1 won, Team 2 got Zapato
            for (const pid of team1) {
              const stats = playerExtraStats.get(pid);
              if (stats) stats.zapatosGiven++;
            }
            for (const pid of team2) {
              const stats = playerExtraStats.get(pid);
              if (stats) stats.zapatosReceived++;
            }
          }
        }

        // Check for Chancleta
        const gameHands = handsByGame.get(g.id);
        if (gameHands && gameHands.length > 0) {
          let isChancleta = false;
          if (t1Won) {
            // Team 1 won. Did Team 2 score in exactly 1 hand?
            const team2HandsScored = gameHands.filter(h => h.team2_points > 0).length;
            if (team2HandsScored === 1) {
              isChancleta = true;
            }
          } else {
            // Team 2 won. Did Team 1 score in exactly 1 hand?
            const team1HandsScored = gameHands.filter(h => h.team1_points > 0).length;
            if (team1HandsScored === 1) {
              isChancleta = true;
            }
          }

          if (isChancleta) {
            totalChancletas++;
            if (t1Won) {
              for (const pid of team1) {
                const stats = playerExtraStats.get(pid);
                if (stats) stats.chancletasGiven++;
              }
              for (const pid of team2) {
                const stats = playerExtraStats.get(pid);
                if (stats) stats.chancletasReceived++;
              }
            } else {
              for (const pid of team2) {
                const stats = playerExtraStats.get(pid);
                if (stats) stats.chancletasGiven++;
              }
              for (const pid of team1) {
                const stats = playerExtraStats.get(pid);
                if (stats) stats.chancletasReceived++;
              }
            }
          }
        }

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
        s.gameDiff = s.wins - s.losses;
        s.diff = s.pf - s.pa;
        s.winRate = s.played > 0 ? s.wins / s.played : 0;
        s.tournaments = playerTournaments.get(pid)?.size ?? 0;
      }

      standings = [...map.values()]
        .filter((s) => s.played > 0)
        .sort(
          (a, b) =>
            b.gameDiff - a.gameDiff ||
            b.diff - a.diff ||
            b.winRate - a.winRate ||
            b.pf - a.pf,
        );

      totalTournaments = tournamentIds.size;

      if (standings.length > 0) {
        const maxPlayed = Math.max(...standings.map((s) => s.played), 0);
        const minGamesThreshold = maxPlayed >= 3 ? 3 : 1;

        // 1. Best Offense: highest average points scored per game
        let bestOffenseVal = -1;
        let bestOffenseS: AllTimeStats | null = null;
        for (const s of standings) {
          if (s.played >= minGamesThreshold) {
            const avg = s.pf / s.played;
            if (avg > bestOffenseVal) {
              bestOffenseVal = avg;
              bestOffenseS = s;
            }
          }
        }
        if (bestOffenseS) {
          bestOffense = { player: bestOffenseS.player, value: bestOffenseVal };
        }

        // 2. Best Defense: lowest average points allowed per game
        let bestDefenseVal = Infinity;
        let bestDefenseS: AllTimeStats | null = null;
        for (const s of standings) {
          if (s.played >= minGamesThreshold) {
            const avg = s.pa / s.played;
            if (avg < bestDefenseVal) {
              bestDefenseVal = avg;
              bestDefenseS = s;
            }
          }
        }
        if (bestDefenseS) {
          bestDefense = { player: bestDefenseS.player, value: bestDefenseVal };
        }

        // 3. Most Dominant: highest win rate
        let mostDominantVal = -1;
        let mostDominantS: AllTimeStats | null = null;
        for (const s of standings) {
          if (s.played >= minGamesThreshold) {
            if (s.winRate > mostDominantVal) {
              mostDominantVal = s.winRate;
              mostDominantS = s;
            } else if (s.winRate === mostDominantVal && mostDominantS) {
              if (s.gameDiff > mostDominantS.gameDiff) {
                mostDominantS = s;
              }
            }
          }
        }
        if (mostDominantS) {
          mostDominant = { player: mostDominantS.player, value: mostDominantVal };
        }

        // 4. Most Active: highest s.played
        let mostActiveVal = -1;
        let mostActiveS: AllTimeStats | null = null;
        for (const s of standings) {
          if (s.played > mostActiveVal) {
            mostActiveVal = s.played;
            mostActiveS = s;
          } else if (s.played === mostActiveVal && mostActiveS) {
            if (s.wins > mostActiveS.wins) {
              mostActiveS = s;
            }
          }
        }
        if (mostActiveS) {
          mostActive = { player: mostActiveS.player, value: mostActiveVal };
        }

        // 5. Most Zapatos Given: highest count of Zapatos given
        let maxZapatosGiven = 0;
        let mostZapatosGivenPlayers: Player[] = [];
        for (const s of standings) {
          const stats = playerExtraStats.get(s.player.id);
          if (stats && stats.zapatosGiven > 0) {
            if (stats.zapatosGiven > maxZapatosGiven) {
              maxZapatosGiven = stats.zapatosGiven;
              mostZapatosGivenPlayers = [s.player];
            } else if (stats.zapatosGiven === maxZapatosGiven) {
              mostZapatosGivenPlayers.push(s.player);
            }
          }
        }
        if (maxZapatosGiven > 0) {
          mostZapatosGiven = { players: mostZapatosGivenPlayers, value: maxZapatosGiven };
        }

        // 6. Most Zapatos Received: highest count of Zapatos received
        let maxZapatosReceived = 0;
        let mostZapatosReceivedPlayers: Player[] = [];
        for (const s of standings) {
          const stats = playerExtraStats.get(s.player.id);
          if (stats && stats.zapatosReceived > 0) {
            if (stats.zapatosReceived > maxZapatosReceived) {
              maxZapatosReceived = stats.zapatosReceived;
              mostZapatosReceivedPlayers = [s.player];
            } else if (stats.zapatosReceived === maxZapatosReceived) {
              mostZapatosReceivedPlayers.push(s.player);
            }
          }
        }
        if (maxZapatosReceived > 0) {
          mostZapatosReceived = { players: mostZapatosReceivedPlayers, value: maxZapatosReceived };
        }
      }
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
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-surface text-left text-muted">
              <tr>
                <th className="px-3 py-3 text-center font-medium sm:px-4">#</th>
                <th className="px-3 py-3 font-medium sm:px-4">Jugador</th>
                <th className="px-3 py-3 text-center font-medium sm:px-4">T</th>
                <th className="px-3 py-3 text-center font-medium sm:px-4">PJ</th>
                <th className="px-3 py-3 text-center font-medium sm:px-4">G</th>
                <th className="px-3 py-3 text-center font-medium sm:px-4">P</th>
                <th className="px-3 py-3 text-center font-medium sm:px-4">DJ</th>
                <th className="px-3 py-3 text-center font-medium sm:px-4">%G</th>
                <th className="px-3 py-3 text-center font-medium sm:px-4">PF</th>
                <th className="px-3 py-3 text-center font-medium sm:px-4">PC</th>
                <th className="px-3 py-3 text-center font-medium sm:px-4">DIF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {standings.map((s, i) => (
                <tr
                  key={s.player.id}
                  className={`hover:bg-surface-hover ${!s.player.active ? "opacity-50" : ""} ${s.player.id === myPlayerId ? "bg-accent/10 ring-1 ring-inset ring-accent/30" : i < 3 ? "bg-primary/5" : ""}`}
                >
                  <td className="px-3 py-3 text-center font-bold sm:px-4">
                    {i === 0
                      ? "🥇"
                      : i === 1
                        ? "🥈"
                        : i === 2
                          ? "🥉"
                          : i + 1}
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
                  <td className="px-3 py-3 text-center text-muted sm:px-4">
                    {s.tournaments}
                  </td>
                  <td className="px-3 py-3 text-center sm:px-4">{s.played}</td>
                  <td className="px-3 py-3 text-center font-semibold text-primary sm:px-4">
                    {s.wins}
                  </td>
                  <td className="px-3 py-3 text-center text-danger sm:px-4">
                    {s.losses}
                  </td>
                  <td
                    className={`px-3 py-3 text-center font-mono font-semibold sm:px-4 ${
                      s.gameDiff > 0
                        ? "text-primary"
                        : s.gameDiff < 0
                          ? "text-danger"
                          : "text-muted"
                    }`}
                  >
                    {s.gameDiff > 0 ? `+${s.gameDiff}` : s.gameDiff}
                  </td>
                  <td className="px-3 py-3 text-center font-mono sm:px-4">
                    {(s.winRate * 100).toFixed(0)}%
                  </td>
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
      )}

      {/* Column legend */}
      {standings.length > 0 && (
        <p className="text-xs text-muted">
          Ordenado por diferencia de juegos (DJ), luego diferencial de puntos (DIF), porcentaje de victorias (%G) y puntos a favor (PF). <br />
          T = Torneos &middot; PJ = Partidos jugados &middot; G = Ganados &middot; P = Perdidos &middot; DJ = Diferencia de Juegos (G - P) &middot; %G = Porcentaje de victorias &middot; PF = Puntos a favor &middot; PC = Puntos en contra &middot; DIF = Diferencial de puntos
        </p>
      )}

      {/* League Statistics & Achievements */}
      {standings.length > 0 && (
        <div className="pt-6 border-t border-border/40 space-y-8">
          {/* Summary Stats Cards */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Estadísticas Generales de la Liga
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-surface border border-border/80 rounded-xl p-4 flex flex-col justify-between hover:border-primary/30 transition-all duration-200 shadow-md">
                <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                  Partidos Jugados
                </span>
                <span className="text-3xl font-extrabold text-foreground mt-2">
                  {totalGames}
                </span>
              </div>
              <div className="bg-surface border border-border/80 rounded-xl p-4 flex flex-col justify-between hover:border-primary/30 transition-all duration-200 shadow-md">
                <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                  Puntos Anotados
                </span>
                <span className="text-3xl font-extrabold text-foreground mt-2">
                  {totalPoints}
                </span>
              </div>
              <div className="bg-surface border border-border/80 rounded-xl p-4 flex flex-col justify-between hover:border-primary/30 transition-all duration-200 shadow-md">
                <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                  Promedio por Partido
                </span>
                <span className="text-3xl font-extrabold text-foreground mt-2">
                  {totalGames > 0 ? (totalPoints / totalGames).toFixed(1) : "0"}
                </span>
              </div>
              <div className="bg-surface border border-border/80 rounded-xl p-4 flex flex-col justify-between hover:border-primary/30 transition-all duration-200 shadow-md">
                <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                  Torneos Activos
                </span>
                <span className="text-3xl font-extrabold text-foreground mt-2">
                  {totalTournaments}
                </span>
              </div>
              <div className="bg-surface border border-border/80 rounded-xl p-4 flex flex-col justify-between hover:border-primary/30 transition-all duration-200 shadow-md">
                <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                  Zapatos Totales
                </span>
                <span className="text-3xl font-extrabold text-accent mt-2">
                  {totalZapatos}
                </span>
              </div>
              <div className="bg-surface border border-border/80 rounded-xl p-4 flex flex-col justify-between hover:border-primary/30 transition-all duration-200 shadow-md">
                <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                  Chancletas Totales
                </span>
                <span className="text-3xl font-extrabold text-blue-400 mt-2">
                  {totalChancletas}
                </span>
              </div>
            </div>
          </div>

          {/* Achievement Cards / Awards */}
          {(bestOffense || bestDefense || mostDominant || mostActive || mostZapatosGiven || mostZapatosReceived) && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Cuadro de Honor
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {bestOffense && (
                  <div className="bg-surface border border-border/80 hover:border-danger/40 rounded-xl p-5 flex items-start space-x-4 transition-all duration-300 shadow-md hover:-translate-y-1">
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-danger/10 border border-danger/20 flex items-center justify-center text-2xl">
                      🔥
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-semibold text-muted uppercase tracking-wider block">
                        Mejor Ofensiva
                      </span>
                      <h3 className="text-sm font-bold text-foreground truncate mt-1">
                        {bestOffense.player.name}
                      </h3>
                      <p className="text-xs text-danger font-semibold mt-0.5">
                        {bestOffense.value.toFixed(1)} PTS / juego
                      </p>
                      <p className="text-[11px] text-muted mt-1 leading-normal">
                        Mayor promedio de puntos a favor.
                      </p>
                    </div>
                  </div>
                )}

                {bestDefense && (
                  <div className="bg-surface border border-border/80 hover:border-primary/40 rounded-xl p-5 flex items-start space-x-4 transition-all duration-300 shadow-md hover:-translate-y-1">
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-2xl">
                      🛡️
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-semibold text-muted uppercase tracking-wider block">
                        Mejor Defensa
                      </span>
                      <h3 className="text-sm font-bold text-foreground truncate mt-1">
                        {bestDefense.player.name}
                      </h3>
                      <p className="text-xs text-primary font-semibold mt-0.5">
                        {bestDefense.value.toFixed(1)} PTS / juego
                      </p>
                      <p className="text-[11px] text-muted mt-1 leading-normal">
                        Menor promedio de puntos en contra.
                      </p>
                    </div>
                  </div>
                )}

                {mostDominant && (
                  <div className="bg-surface border border-border/80 hover:border-accent/40 rounded-xl p-5 flex items-start space-x-4 transition-all duration-300 shadow-md hover:-translate-y-1">
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-2xl">
                      👑
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-semibold text-muted uppercase tracking-wider block">
                        Más Dominante
                      </span>
                      <h3 className="text-sm font-bold text-foreground truncate mt-1">
                        {mostDominant.player.name}
                      </h3>
                      <p className="text-xs text-accent font-semibold mt-0.5">
                        {(mostDominant.value * 100).toFixed(0)}% victorias
                      </p>
                      <p className="text-[11px] text-muted mt-1 leading-normal">
                        Mayor porcentaje de victorias.
                      </p>
                    </div>
                  </div>
                )}

                {mostActive && (
                  <div className="bg-surface border border-border/80 hover:border-blue-500/40 rounded-xl p-5 flex items-start space-x-4 transition-all duration-300 shadow-md hover:-translate-y-1">
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-2xl">
                      🔋
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-semibold text-muted uppercase tracking-wider block">
                        El Más Activo
                      </span>
                      <h3 className="text-sm font-bold text-foreground truncate mt-1">
                        {mostActive.player.name}
                      </h3>
                      <p className="text-xs text-blue-400 font-semibold mt-0.5">
                        {mostActive.value} partidos
                      </p>
                      <p className="text-[11px] text-muted mt-1 leading-normal">
                        Más partidos jugados en la liga.
                      </p>
                    </div>
                  </div>
                )}

                {mostZapatosGiven && (
                  <div className="bg-surface border border-border/80 hover:border-accent/40 rounded-xl p-5 flex items-start space-x-4 transition-all duration-300 shadow-md hover:-translate-y-1">
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-2xl font-semibold">
                      👞
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-semibold text-muted uppercase tracking-wider block">
                        Más Zapatos Entregados
                      </span>
                      <h3 className="text-sm font-bold text-foreground truncate mt-1" title={mostZapatosGiven.players.map(p => p.name).join(" / ")}>
                        {mostZapatosGiven.players.map(p => p.name).join(" / ")}
                      </h3>
                      <p className="text-xs text-accent font-semibold mt-0.5">
                        {mostZapatosGiven.value} zapato{mostZapatosGiven.value !== 1 ? "s" : ""} dado{mostZapatosGiven.value !== 1 ? "s" : ""}
                      </p>
                      <p className="text-[11px] text-muted mt-1 leading-normal">
                        Mayor cantidad de victorias por 100-0.
                      </p>
                    </div>
                  </div>
                )}

                {mostZapatosReceived && (
                  <div className="bg-surface border border-border/80 hover:border-danger/40 rounded-xl p-5 flex items-start space-x-4 transition-all duration-300 shadow-md hover:-translate-y-1">
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-danger/10 border border-danger/20 flex items-center justify-center text-2xl">
                      🤕
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-semibold text-muted uppercase tracking-wider block">
                        Más Zapatos Recibidos
                      </span>
                      <h3 className="text-sm font-bold text-foreground truncate mt-1" title={mostZapatosReceived.players.map(p => p.name).join(" / ")}>
                        {mostZapatosReceived.players.map(p => p.name).join(" / ")}
                      </h3>
                      <p className="text-xs text-danger font-semibold mt-0.5">
                        {mostZapatosReceived.value} zapato{mostZapatosReceived.value !== 1 ? "s" : ""} recibido{mostZapatosReceived.value !== 1 ? "s" : ""}
                      </p>
                      <p className="text-[11px] text-muted mt-1 leading-normal">
                        Mayor cantidad de derrotas por 100-0.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
