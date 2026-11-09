"use server";

import { revalidatePath } from "next/cache";
import crypto from "crypto";
import { db } from "@/lib/db";
import { generateSchedule } from "@/lib/algorithm";
import { requireAdmin, getSession, type UserRole } from "@/lib/auth";
import { notifyTournamentChange } from "@/lib/events";
import type { Tournament, Player, Round, Game, Bye, Hand } from "@/lib/types";

// ── Tournaments ─────────────────────────────────────────────────────────────

export async function createTournament(formData: FormData) {
  await requireAdmin();

  const name = (formData.get("name") as string).trim();
  const tableCount = parseInt(formData.get("table_count") as string, 10);
  const playerIds: string[] = JSON.parse(formData.get("player_ids") as string);

  if (!name) return { error: "Nombre del torneo es obligatorio" };
  if (tableCount < 1) return { error: "Se necesita al menos 1 mesa" };
  if (playerIds.length < 4) return { error: "Se necesitan al menos 4 jugadores" };

  const tournamentId = crypto.randomUUID();

  const insertTournament = db.transaction(() => {
    db.prepare(`
      INSERT INTO tournaments (id, name, table_count, status, created_at)
      VALUES (?, ?, ?, 'setup', datetime('now'))
    `).run(tournamentId, name, tableCount);

    const insertTP = db.prepare(`
      INSERT INTO tournament_players (tournament_id, player_id, sort_order)
      VALUES (?, ?, ?)
    `);

    playerIds.forEach((pid, i) => {
      insertTP.run(tournamentId, pid, i + 1);
    });
  });

  try {
    insertTournament();
    revalidatePath("/");
    notifyTournamentChange(tournamentId);
    return { success: true, tournamentId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error creando torneo";
    return { error: message };
  }
}

export async function generateTournamentSchedule(tournamentId: string) {
  await requireAdmin();

  const tournament = db
    .prepare("SELECT * FROM tournaments WHERE id = ?")
    .get(tournamentId) as Tournament | undefined;

  if (!tournament) return { error: "Torneo no encontrado" };

  const tPlayers = db
    .prepare("SELECT player_id FROM tournament_players WHERE tournament_id = ?")
    .all(tournamentId) as { player_id: string }[];

  if (!tPlayers || tPlayers.length < 4) return { error: "Se necesitan al menos 4 jugadores" };

  // Shuffle player order (the "sorteo")
  const playerIds = tPlayers
    .map((tp) => tp.player_id)
    .sort(() => Math.random() - 0.5);

  const schedule = generateSchedule(playerIds.length, tournament.table_count);

  const executeSchedule = db.transaction(() => {
    // Update sort order
    const updateSort = db.prepare(`
      UPDATE tournament_players
      SET sort_order = ?
      WHERE tournament_id = ? AND player_id = ?
    `);
    for (let i = 0; i < playerIds.length; i++) {
      updateSort.run(i + 1, tournamentId, playerIds[i]);
    }

    // Delete existing rounds/games/byes if regenerating
    const existingRounds = db
      .prepare("SELECT id FROM rounds WHERE tournament_id = ?")
      .all(tournamentId) as { id: string }[];

    if (existingRounds.length > 0) {
      const roundIds = existingRounds.map((r) => r.id);
      for (const rid of roundIds) {
        db.prepare("DELETE FROM games WHERE round_id = ?").run(rid);
        db.prepare("DELETE FROM byes WHERE round_id = ?").run(rid);
      }
      db.prepare("DELETE FROM rounds WHERE tournament_id = ?").run(tournamentId);
    }

    // Insert rounds, games, and byes
    const insertRound = db.prepare(`
      INSERT INTO rounds (id, tournament_id, round_number)
      VALUES (?, ?, ?)
    `);
    const insertGame = db.prepare(`
      INSERT INTO games (id, round_id, table_number, team1_player1, team1_player2, team2_player1, team2_player2, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `);
    const insertBye = db.prepare(`
      INSERT INTO byes (round_id, player_id)
      VALUES (?, ?)
    `);

    for (const round of schedule) {
      const roundId = crypto.randomUUID();
      insertRound.run(roundId, tournamentId, round.roundNumber);

      for (const g of round.games) {
        insertGame.run(
          crypto.randomUUID(),
          roundId,
          g.table,
          playerIds[g.team1[0]],
          playerIds[g.team1[1]],
          playerIds[g.team2[0]],
          playerIds[g.team2[1]]
        );
      }

      for (const idx of round.byes) {
        insertBye.run(roundId, playerIds[idx]);
      }
    }

    db.prepare("UPDATE tournaments SET status = 'active' WHERE id = ?").run(tournamentId);
  });

  try {
    executeSchedule();
    revalidatePath(`/admin/tournament/${tournamentId}`);
    notifyTournamentChange(tournamentId);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error creando ronda";
    return { error: message };
  }
}

export async function updateGameScore(
  gameId: string,
  team1Score: number,
  team2Score: number
) {
  await requireAdmin();

  const game = db
    .prepare("SELECT round_id FROM games WHERE id = ?")
    .get(gameId) as { round_id: string } | undefined;
  if (!game) return { error: "Juego no encontrado" };

  const round = db
    .prepare("SELECT tournament_id FROM rounds WHERE id = ?")
    .get(game.round_id) as { tournament_id: string } | undefined;

  const runUpdate = db.transaction(() => {
    db.prepare("DELETE FROM hands WHERE game_id = ?").run(gameId);
    db.prepare(`
      UPDATE games
      SET team1_score = ?, team2_score = ?, status = 'completed'
      WHERE id = ?
    `).run(team1Score, team2Score, gameId);
  });

  try {
    runUpdate();
    if (round?.tournament_id) notifyTournamentChange(round.tournament_id);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al actualizar marcador";
    return { error: message };
  }
}

export async function resetGameScore(gameId: string) {
  await requireAdmin();

  const game = db
    .prepare("SELECT round_id FROM games WHERE id = ?")
    .get(gameId) as { round_id: string } | undefined;
  if (!game) return { error: "Juego no encontrado" };

  const round = db
    .prepare("SELECT tournament_id FROM rounds WHERE id = ?")
    .get(game.round_id) as { tournament_id: string } | undefined;

  const runReset = db.transaction(() => {
    db.prepare("DELETE FROM hands WHERE game_id = ?").run(gameId);
    db.prepare(`
      UPDATE games
      SET team1_score = NULL, team2_score = NULL, status = 'pending'
      WHERE id = ?
    `).run(gameId);
  });

  try {
    runReset();
    if (round?.tournament_id) notifyTournamentChange(round.tournament_id);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al reiniciar marcador";
    return { error: message };
  }
}

export async function renameTournament(tournamentId: string, name: string) {
  await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Nombre es obligatorio" };

  try {
    db.prepare("UPDATE tournaments SET name = ? WHERE id = ?").run(trimmed, tournamentId);
    revalidatePath(`/admin/tournament/${tournamentId}`);
    notifyTournamentChange(tournamentId);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error renombrando torneo";
    return { error: message };
  }
}

export async function deleteTournament(tournamentId: string) {
  await requireAdmin();

  try {
    const runDelete = db.transaction(() => {
      const rounds = db
        .prepare("SELECT id FROM rounds WHERE tournament_id = ?")
        .all(tournamentId) as { id: string }[];

      if (rounds.length > 0) {
        const roundIds = rounds.map((r) => r.id);
        for (const rid of roundIds) {
          const games = db
            .prepare("SELECT id FROM games WHERE round_id = ?")
            .all(rid) as { id: string }[];
          for (const g of games) {
            db.prepare("DELETE FROM hands WHERE game_id = ?").run(g.id);
          }
          db.prepare("DELETE FROM games WHERE round_id = ?").run(rid);
          db.prepare("DELETE FROM byes WHERE round_id = ?").run(rid);
        }
        db.prepare("DELETE FROM rounds WHERE tournament_id = ?").run(tournamentId);
      }
      db.prepare("DELETE FROM tournament_players WHERE tournament_id = ?").run(tournamentId);
      db.prepare("DELETE FROM tournaments WHERE id = ?").run(tournamentId);
    });

    runDelete();
    revalidatePath("/");
    revalidatePath("/standings");
    notifyTournamentChange(tournamentId);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error eliminando torneo";
    return { error: message };
  }
}

export async function updateTournament(
  tournamentId: string,
  name: string,
  tableCount: number,
  playerIds: string[]
) {
  await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Nombre del torneo es obligatorio" };
  if (tableCount < 1) return { error: "Se necesita al menos 1 mesa" };
  if (playerIds.length < 4) return { error: "Se necesitan al menos 4 jugadores" };

  // Block if any game already has scores
  const rounds = db
    .prepare("SELECT id FROM rounds WHERE tournament_id = ?")
    .all(tournamentId) as { id: string }[];

  if (rounds.length > 0) {
    const hasScores = db
      .prepare(`
        SELECT id FROM games
        WHERE round_id IN (${rounds.map(() => "?").join(",")})
          AND team1_score IS NOT NULL
        LIMIT 1
      `)
      .get(...rounds.map((r) => r.id));

    if (hasScores) {
      return { error: "No se puede modificar un torneo con resultados registrados" };
    }
  }

  const runUpdate = db.transaction(() => {
    db.prepare("UPDATE tournaments SET name = ?, table_count = ? WHERE id = ?").run(
      trimmed,
      tableCount,
      tournamentId
    );

    db.prepare("DELETE FROM tournament_players WHERE tournament_id = ?").run(tournamentId);

    const insertTP = db.prepare(`
      INSERT INTO tournament_players (tournament_id, player_id, sort_order)
      VALUES (?, ?, ?)
    `);
    playerIds.forEach((pid, i) => {
      insertTP.run(tournamentId, pid, i + 1);
    });

    if (rounds.length > 0) {
      for (const r of rounds) {
        db.prepare("DELETE FROM games WHERE round_id = ?").run(r.id);
        db.prepare("DELETE FROM byes WHERE round_id = ?").run(r.id);
      }
      db.prepare("DELETE FROM rounds WHERE tournament_id = ?").run(tournamentId);
      db.prepare("UPDATE tournaments SET status = 'setup' WHERE id = ?").run(tournamentId);
    }
  });

  try {
    runUpdate();
    revalidatePath(`/admin/tournament/${tournamentId}`);
    notifyTournamentChange(tournamentId);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al actualizar torneo";
    return { error: message };
  }
}

// ── Players ──────────────────────────────────────────────────────────────

export async function deactivatePlayer(playerId: string) {
  await requireAdmin();
  if (!playerId) return { error: "ID de jugador es obligatorio" };

  const player = db.prepare("SELECT role FROM players WHERE id = ?").get(playerId) as
    | { role: string }
    | undefined;

  if (player?.role === "admin") {
    return { error: "No se puede desactivar a un administrador" };
  }

  db.prepare("UPDATE players SET active = 0 WHERE id = ?").run(playerId);
  revalidatePath("/players");
  return { success: true };
}

export async function reactivatePlayer(playerId: string) {
  await requireAdmin();
  if (!playerId) return { error: "ID de jugador es obligatorio" };

  db.prepare("UPDATE players SET active = 1 WHERE id = ?").run(playerId);
  revalidatePath("/players");
  revalidatePath("/standings");
  return { success: true };
}

export async function deletePlayer(playerId: string) {
  await requireAdmin();
  if (!playerId) return { error: "ID de jugador es obligatorio" };

  const session = await getSession();
  if (session?.playerId === playerId) {
    return { error: "No puedes eliminar tu propia cuenta de administrador" };
  }

  const player = db.prepare("SELECT * FROM players WHERE id = ?").get(playerId) as
    | { id: string; name: string; email: string; role: string; active: number }
    | undefined;

  if (!player) return { error: "Usuario no encontrado" };

  if (player.role === "admin") {
    return { error: "No se puede eliminar a un administrador" };
  }

  try {
    const runDelete = db.transaction(() => {
      const gameCount = (
        db.prepare(`
          SELECT COUNT(*) as count FROM games
          WHERE team1_player1 = ? OR team1_player2 = ? OR team2_player1 = ? OR team2_player2 = ? OR salidor_player_id = ?
        `).get(playerId, playerId, playerId, playerId, playerId) as { count: number }
      ).count;

      if (gameCount > 0) {
        const placeholderId = "deleted-player";
        db.prepare(`
          INSERT OR IGNORE INTO players (id, name, email, active, role, created_at)
          VALUES (?, ?, ?, 0, 'player', datetime('now'))
        `).run(placeholderId, "[Eliminado]", "deleted@sistema.local");

        db.prepare("UPDATE games SET team1_player1 = ? WHERE team1_player1 = ?").run(placeholderId, playerId);
        db.prepare("UPDATE games SET team1_player2 = ? WHERE team1_player2 = ?").run(placeholderId, playerId);
        db.prepare("UPDATE games SET team2_player1 = ? WHERE team2_player1 = ?").run(placeholderId, playerId);
        db.prepare("UPDATE games SET team2_player2 = ? WHERE team2_player2 = ?").run(placeholderId, playerId);
        db.prepare("UPDATE games SET salidor_player_id = ? WHERE salidor_player_id = ?").run(placeholderId, playerId);

        const tps = db.prepare("SELECT tournament_id FROM tournament_players WHERE player_id = ?").all(playerId) as { tournament_id: string }[];
        for (const tp of tps) {
          const exists = db.prepare("SELECT 1 FROM tournament_players WHERE tournament_id = ? AND player_id = ?").get(tp.tournament_id, placeholderId);
          if (!exists) {
            db.prepare("UPDATE tournament_players SET player_id = ? WHERE tournament_id = ? AND player_id = ?").run(placeholderId, tp.tournament_id, playerId);
          } else {
            db.prepare("DELETE FROM tournament_players WHERE tournament_id = ? AND player_id = ?").run(tp.tournament_id, playerId);
          }
        }

        const byes = db.prepare("SELECT round_id FROM byes WHERE player_id = ?").all(playerId) as { round_id: string }[];
        for (const b of byes) {
          const exists = db.prepare("SELECT 1 FROM byes WHERE round_id = ? AND player_id = ?").get(b.round_id, placeholderId);
          if (!exists) {
            db.prepare("UPDATE byes SET player_id = ? WHERE round_id = ? AND player_id = ?").run(placeholderId, b.round_id, playerId);
          } else {
            db.prepare("DELETE FROM byes WHERE round_id = ? AND player_id = ?").run(b.round_id, playerId);
          }
        }
      } else {
        db.prepare("DELETE FROM tournament_players WHERE player_id = ?").run(playerId);
        db.prepare("DELETE FROM byes WHERE player_id = ?").run(playerId);
      }

      db.prepare("DELETE FROM password_resets WHERE LOWER(email) = LOWER(?)").run(player.email);
      db.prepare("DELETE FROM players WHERE id = ?").run(playerId);
    });

    runDelete();
    revalidatePath("/players");
    revalidatePath("/standings");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al eliminar usuario";
    return { error: message };
  }
}

// ── Hand-by-hand scoring ────────────────────────────────────────────────────

const WINNING_SCORE = 100;

export async function addHandScore(
  gameId: string,
  team1Points: number,
  team2Points: number
) {
  await requireAdmin();
  if (team1Points < 0 || team2Points < 0) return { error: "Los puntos no pueden ser negativos" };
  if (team1Points > 0 && team2Points > 0) return { error: "Solo un equipo puede anotar por mano" };

  const game = db
    .prepare("SELECT round_id FROM games WHERE id = ?")
    .get(gameId) as { round_id: string } | undefined;
  if (!game) return { error: "Juego no encontrado" };

  const round = db
    .prepare("SELECT tournament_id FROM rounds WHERE id = ?")
    .get(game.round_id) as { tournament_id: string } | undefined;

  let isComplete = false;

  const runAdd = db.transaction(() => {
    const lastHand = db
      .prepare("SELECT hand_number FROM hands WHERE game_id = ? ORDER BY hand_number DESC LIMIT 1")
      .get(gameId) as { hand_number: number } | undefined;

    const nextNumber = (lastHand?.hand_number ?? 0) + 1;
    const handId = crypto.randomUUID();

    db.prepare(`
      INSERT INTO hands (id, game_id, hand_number, team1_points, team2_points, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(handId, gameId, nextNumber, team1Points, team2Points);

    const allHands = db
      .prepare("SELECT team1_points, team2_points FROM hands WHERE game_id = ?")
      .all(gameId) as { team1_points: number; team2_points: number }[];

    let total1 = 0;
    let total2 = 0;
    for (const h of allHands) {
      total1 += h.team1_points;
      total2 += h.team2_points;
    }

    isComplete = total1 >= WINNING_SCORE || total2 >= WINNING_SCORE;

    db.prepare(`
      UPDATE games
      SET team1_score = ?, team2_score = ?, status = ?
      WHERE id = ?
    `).run(total1, total2, isComplete ? "completed" : "in_progress", gameId);
  });

  try {
    runAdd();
    if (round?.tournament_id) notifyTournamentChange(round.tournament_id);
    return { success: true, completed: isComplete };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error anotando mano";
    return { error: message };
  }
}

export async function updateHandScore(
  handId: string,
  team1Points: number,
  team2Points: number
) {
  await requireAdmin();
  if (team1Points < 0 || team2Points < 0) return { error: "Los puntos no pueden ser negativos" };
  if (team1Points > 0 && team2Points > 0) return { error: "Solo un equipo puede anotar por mano" };

  const hand = db.prepare("SELECT game_id FROM hands WHERE id = ?").get(handId) as
    | { game_id: string }
    | undefined;
  if (!hand) return { error: "Mano no encontrada" };

  const game = db
    .prepare("SELECT round_id FROM games WHERE id = ?")
    .get(hand.game_id) as { round_id: string } | undefined;
  const round = game
    ? (db.prepare("SELECT tournament_id FROM rounds WHERE id = ?").get(game.round_id) as {
        tournament_id: string;
      } | undefined)
    : undefined;

  const runUpdate = db.transaction(() => {
    db.prepare("UPDATE hands SET team1_points = ?, team2_points = ? WHERE id = ?").run(
      team1Points,
      team2Points,
      handId
    );

    const allHands = db
      .prepare("SELECT team1_points, team2_points FROM hands WHERE game_id = ?")
      .all(hand.game_id) as { team1_points: number; team2_points: number }[];

    let total1 = 0;
    let total2 = 0;
    for (const h of allHands) {
      total1 += h.team1_points;
      total2 += h.team2_points;
    }

    const isComplete = total1 >= WINNING_SCORE || total2 >= WINNING_SCORE;

    db.prepare(`
      UPDATE games
      SET team1_score = ?, team2_score = ?, status = ?
      WHERE id = ?
    `).run(total1, total2, isComplete ? "completed" : "in_progress", hand.game_id);
  });

  try {
    runUpdate();
    if (round?.tournament_id) notifyTournamentChange(round.tournament_id);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error actualizando mano";
    return { error: message };
  }
}

export async function removeLastHand(gameId: string) {
  await requireAdmin();

  const game = db
    .prepare("SELECT round_id FROM games WHERE id = ?")
    .get(gameId) as { round_id: string } | undefined;
  if (!game) return { error: "Juego no encontrado" };

  const round = db
    .prepare("SELECT tournament_id FROM rounds WHERE id = ?")
    .get(game.round_id) as { tournament_id: string } | undefined;

  const runRemove = db.transaction(() => {
    const lastHand = db
      .prepare("SELECT id FROM hands WHERE game_id = ? ORDER BY hand_number DESC LIMIT 1")
      .get(gameId) as { id: string } | undefined;

    if (!lastHand) throw new Error("No hay manos para deshacer");

    db.prepare("DELETE FROM hands WHERE id = ?").run(lastHand.id);

    const remaining = db
      .prepare("SELECT team1_points, team2_points FROM hands WHERE game_id = ?")
      .all(gameId) as { team1_points: number; team2_points: number }[];

    let total1 = 0;
    let total2 = 0;
    for (const h of remaining) {
      total1 += h.team1_points;
      total2 += h.team2_points;
    }

    const hasHands = remaining.length > 0;
    db.prepare(`
      UPDATE games
      SET team1_score = ?, team2_score = ?, status = ?
      WHERE id = ?
    `).run(hasHands ? total1 : null, hasHands ? total2 : null, hasHands ? "in_progress" : "pending", gameId);
  });

  try {
    runRemove();
    if (round?.tournament_id) notifyTournamentChange(round.tournament_id);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error deshaciendo mano";
    return { error: message };
  }
}

export async function setSalidor(gameId: string, playerId: string | null) {
  await requireAdmin();

  const game = db
    .prepare("SELECT round_id FROM games WHERE id = ?")
    .get(gameId) as { round_id: string } | undefined;
  const round = game
    ? (db.prepare("SELECT tournament_id FROM rounds WHERE id = ?").get(game.round_id) as {
        tournament_id: string;
      } | undefined)
    : undefined;

  try {
    db.prepare("UPDATE games SET salidor_player_id = ? WHERE id = ?").run(playerId, gameId);
    if (round?.tournament_id) notifyTournamentChange(round.tournament_id);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error estableciendo salidor";
    return { error: message };
  }
}

export async function completeTournament(tournamentId: string) {
  await requireAdmin();

  try {
    db.prepare("UPDATE tournaments SET status = 'completed' WHERE id = ?").run(tournamentId);
    revalidatePath(`/admin/tournament/${tournamentId}`);
    notifyTournamentChange(tournamentId);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error completando torneo";
    return { error: message };
  }
}

// ── Query actions for client components ─────────────────────────────────────

export async function getRegisteredUsers() {
  const session = await getSession();
  const players = db
    .prepare("SELECT id, name, email, active, role, created_at FROM players WHERE id != 'deleted-player' ORDER BY name")
    .all() as { id: string; name: string; email: string; active: number; role: string; created_at: string }[];

  return {
    users: players.map((p) => ({
      ...p,
      active: Boolean(p.active),
    })),
    currentUserRole: session?.role ?? null,
  };
}

export async function getPlayersForNewTournament() {
  const rows = db
    .prepare(`
      SELECT p.id, p.name, p.email,
        (SELECT COUNT(*) FROM tournament_players tp WHERE tp.player_id = p.id) as tournamentCount
      FROM players p
      WHERE p.active = 1
      ORDER BY p.name
    `)
    .all() as { id: string; name: string; email: string; tournamentCount: number }[];

  return { players: rows };
}

export async function getTournamentForEdit(tournamentId: string) {
  const tournament = db
    .prepare("SELECT name, table_count FROM tournaments WHERE id = ?")
    .get(tournamentId) as { name: string; table_count: number } | undefined;

  const tpRows = db
    .prepare("SELECT player_id FROM tournament_players WHERE tournament_id = ?")
    .all(tournamentId) as { player_id: string }[];

  const players = db
    .prepare(`
      SELECT p.id, p.name, p.email,
        (SELECT COUNT(*) FROM tournament_players tp WHERE tp.player_id = p.id) as tournamentCount
      FROM players p
      WHERE p.active = 1
      ORDER BY p.name
    `)
    .all() as { id: string; name: string; email: string; tournamentCount: number }[];

  const activeIds = new Set(players.map((p) => p.id));
  const selectedPlayerIds = tpRows.map((r) => r.player_id).filter((pid) => activeIds.has(pid));

  return {
    tournament,
    players,
    selectedPlayerIds,
  };
}

export interface FullRoundData extends Round {
  games: Game[];
  byes: Bye[];
}

export async function getTournamentAdminData(tournamentId: string) {
  const tournament = db
    .prepare("SELECT * FROM tournaments WHERE id = ?")
    .get(tournamentId) as Tournament | undefined;

  if (!tournament) return null;

  const tpRows = db
    .prepare("SELECT player_id, sort_order FROM tournament_players WHERE tournament_id = ? ORDER BY sort_order ASC")
    .all(tournamentId) as { player_id: string; sort_order: number | null }[];

  const playerOrder = tpRows.map((r) => r.player_id);
  const playersMap: Record<string, Player> = {};

  if (playerOrder.length > 0) {
    const pRows = db
      .prepare(`SELECT id, name, email, active, auth_id, role, created_at FROM players WHERE id IN (${playerOrder.map(() => "?").join(",")})`)
      .all(...playerOrder) as Record<string, unknown>[];

    for (const p of pRows) {
      playersMap[p.id as string] = {
        id: p.id as string,
        name: p.name as string,
        email: p.email as string,
        active: Boolean(p.active),
        auth_id: (p.auth_id as string) ?? null,
        role: (p.role as "admin" | "player") ?? "player",
        created_at: p.created_at as string,
      };
    }
  }

  const rounds = db
    .prepare("SELECT * FROM rounds WHERE tournament_id = ? ORDER BY round_number ASC")
    .all(tournamentId) as Round[];

  const fullRounds: FullRoundData[] = [];
  const handsMap: Record<string, Hand[]> = {};

  if (rounds.length > 0) {
    const roundIds = rounds.map((r) => r.id);
    const games = db
      .prepare(`SELECT * FROM games WHERE round_id IN (${roundIds.map(() => "?").join(",")})`)
      .all(...roundIds) as Game[];

    const byes = db
      .prepare(`SELECT * FROM byes WHERE round_id IN (${roundIds.map(() => "?").join(",")})`)
      .all(...roundIds) as Bye[];

    for (const r of rounds) {
      fullRounds.push({
        ...r,
        games: games.filter((g) => g.round_id === r.id),
        byes: byes.filter((b) => b.round_id === r.id),
      });
    }

    if (games.length > 0) {
      const gameIds = games.map((g) => g.id);
      const hands = db
        .prepare(`SELECT * FROM hands WHERE game_id IN (${gameIds.map(() => "?").join(",")}) ORDER BY hand_number ASC`)
        .all(...gameIds) as Hand[];

      for (const h of hands) {
        if (!handsMap[h.game_id]) handsMap[h.game_id] = [];
        handsMap[h.game_id].push(h);
      }
    }
  }

  return {
    tournament,
    playerOrder,
    players: playersMap,
    rounds: fullRounds,
    handsMap,
  };
}

export async function getTournamentLeaderboardData(tournamentId: string) {
  const session = await getSession();

  const tournament = db
    .prepare("SELECT * FROM tournaments WHERE id = ?")
    .get(tournamentId) as Tournament | undefined;

  if (!tournament) return null;

  const tpRows = db
    .prepare("SELECT player_id FROM tournament_players WHERE tournament_id = ?")
    .all(tournamentId) as { player_id: string }[];

  const pIds = tpRows.map((r) => r.player_id);
  const playersMap: Record<string, Player> = {};

  if (pIds.length > 0) {
    const pRows = db
      .prepare(`SELECT id, name, email, active, auth_id, role, created_at FROM players WHERE id IN (${pIds.map(() => "?").join(",")})`)
      .all(...pIds) as Record<string, unknown>[];

    for (const p of pRows) {
      playersMap[p.id as string] = {
        id: p.id as string,
        name: p.name as string,
        email: p.email as string,
        active: Boolean(p.active),
        auth_id: (p.auth_id as string) ?? null,
        role: (p.role as "admin" | "player") ?? "player",
        created_at: p.created_at as string,
      };
    }
  }

  const rounds = db
    .prepare("SELECT id, tournament_id, round_number FROM rounds WHERE tournament_id = ? ORDER BY round_number ASC")
    .all(tournamentId) as Round[];

  let games: Game[] = [];
  let byes: Bye[] = [];
  const handsMap: Record<string, Hand[]> = {};

  if (rounds.length > 0) {
    const roundIds = rounds.map((r) => r.id);
    games = db
      .prepare(`SELECT * FROM games WHERE round_id IN (${roundIds.map(() => "?").join(",")})`)
      .all(...roundIds) as Game[];

    byes = db
      .prepare(`SELECT * FROM byes WHERE round_id IN (${roundIds.map(() => "?").join(",")})`)
      .all(...roundIds) as Bye[];

    if (games.length > 0) {
      const gameIds = games.map((g) => g.id);
      const hands = db
        .prepare(`SELECT * FROM hands WHERE game_id IN (${gameIds.map(() => "?").join(",")}) ORDER BY hand_number ASC`)
        .all(...gameIds) as Hand[];

      for (const h of hands) {
        if (!handsMap[h.game_id]) handsMap[h.game_id] = [];
        handsMap[h.game_id].push(h);
      }
    }
  }

  return {
    tournament,
    rounds,
    games,
    byes,
    players: playersMap,
    handsMap,
    userRole: session?.role ?? null,
    myPlayerId: session?.playerId ?? null,
  };
}
