"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateSchedule } from "@/lib/algorithm";
import { requireAdmin } from "@/lib/auth";

// ── Tournaments ─────────────────────────────────────────────────────────────

export async function createTournament(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();

  const name = (formData.get("name") as string).trim();
  const tableCount = parseInt(formData.get("table_count") as string, 10);
  const playerIds: string[] = JSON.parse(formData.get("player_ids") as string);

  if (!name) return { error: "Nombre del torneo es obligatorio" };
  if (tableCount < 1) return { error: "Se necesita al menos 1 mesa" };
  if (playerIds.length < 4) return { error: "Se necesitan al menos 4 jugadores" };

  const { data: tournament, error: tErr } = await supabase
    .from("tournaments")
    .insert({ name, table_count: tableCount })
    .select("id")
    .single();

  if (tErr || !tournament) return { error: tErr?.message ?? "Error creando torneo" };

  const rows = playerIds.map((pid, i) => ({
    tournament_id: tournament.id,
    player_id: pid,
    sort_order: i + 1,
  }));
  const { error: pErr } = await supabase.from("tournament_players").insert(rows);
  if (pErr) return { error: pErr.message };

  revalidatePath("/");
  return { success: true, tournamentId: tournament.id };
}

export async function generateTournamentSchedule(tournamentId: string) {
  await requireAdmin();
  const supabase = await createClient();

  // Fetch tournament + its players
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", tournamentId)
    .single();
  if (!tournament) return { error: "Torneo no encontrado" };

  const { data: tPlayers } = await supabase
    .from("tournament_players")
    .select("player_id")
    .eq("tournament_id", tournamentId);
  if (!tPlayers || tPlayers.length < 4) return { error: "Se necesitan al menos 4 jugadores" };

  // Shuffle player order (the "sorteo") and persist it
  const playerIds = tPlayers
    .map((tp) => tp.player_id)
    .sort(() => Math.random() - 0.5);

  for (let i = 0; i < playerIds.length; i++) {
    await supabase
      .from("tournament_players")
      .update({ sort_order: i + 1 })
      .eq("tournament_id", tournamentId)
      .eq("player_id", playerIds[i]);
  }
  const schedule = generateSchedule(playerIds.length, tournament.table_count);

  // Delete existing rounds/games if regenerating
  const { data: existingRounds } = await supabase
    .from("rounds")
    .select("id")
    .eq("tournament_id", tournamentId);
  if (existingRounds && existingRounds.length > 0) {
    const roundIds = existingRounds.map((r) => r.id);
    await supabase.from("games").delete().in("round_id", roundIds);
    await supabase.from("byes").delete().in("round_id", roundIds);
    await supabase.from("rounds").delete().eq("tournament_id", tournamentId);
  }

  // Insert rounds, games, and byes
  for (const round of schedule) {
    const { data: dbRound, error: rErr } = await supabase
      .from("rounds")
      .insert({ tournament_id: tournamentId, round_number: round.roundNumber })
      .select("id")
      .single();
    if (rErr || !dbRound) return { error: rErr?.message ?? "Error creando ronda" };

    if (round.games.length > 0) {
      const gameRows = round.games.map((g) => ({
        round_id: dbRound.id,
        table_number: g.table,
        team1_player1: playerIds[g.team1[0]],
        team1_player2: playerIds[g.team1[1]],
        team2_player1: playerIds[g.team2[0]],
        team2_player2: playerIds[g.team2[1]],
      }));
      const { error: gErr } = await supabase.from("games").insert(gameRows);
      if (gErr) return { error: gErr.message };
    }

    if (round.byes.length > 0) {
      const byeRows = round.byes.map((idx) => ({
        round_id: dbRound.id,
        player_id: playerIds[idx],
      }));
      const { error: bErr } = await supabase.from("byes").insert(byeRows);
      if (bErr) return { error: bErr.message };
    }
  }

  // Activate the tournament
  await supabase
    .from("tournaments")
    .update({ status: "active" })
    .eq("id", tournamentId);

  revalidatePath(`/admin/tournament/${tournamentId}`);
  return { success: true };
}

export async function updateGameScore(
  gameId: string,
  team1Score: number,
  team2Score: number,
) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("games")
    .update({
      team1_score: team1Score,
      team2_score: team2Score,
      status: "completed",
    })
    .eq("id", gameId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function renameTournament(tournamentId: string, name: string) {
  await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Nombre es obligatorio" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("tournaments")
    .update({ name: trimmed })
    .eq("id", tournamentId);
  if (error) return { error: error.message };
  revalidatePath(`/admin/tournament/${tournamentId}`);
  return { success: true };
}

export async function deleteTournament(tournamentId: string) {
  await requireAdmin();
  const supabase = await createClient();

  // Cascade: rounds → games/byes are deleted automatically by FK ON DELETE CASCADE.
  // tournament_players is also cascaded. Just delete the tournament row.
  const { error } = await supabase
    .from("tournaments")
    .delete()
    .eq("id", tournamentId);

  if (error) return { error: error.message };
  revalidatePath("/");
  return { success: true };
}

export async function updateTournament(
  tournamentId: string,
  name: string,
  tableCount: number,
  playerIds: string[],
) {
  await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Nombre del torneo es obligatorio" };
  if (tableCount < 1) return { error: "Se necesita al menos 1 mesa" };
  if (playerIds.length < 4) return { error: "Se necesitan al menos 4 jugadores" };
  const supabase = await createClient();

  // Block if any game already has scores
  const { data: rounds } = await supabase
    .from("rounds")
    .select("id")
    .eq("tournament_id", tournamentId);
  if (rounds && rounds.length > 0) {
    const { data: games } = await supabase
      .from("games")
      .select("id")
      .in("round_id", rounds.map((r) => r.id))
      .not("team1_score", "is", null)
      .limit(1);
    if (games && games.length > 0)
      return { error: "No se puede modificar un torneo con resultados registrados" };
  }

  // Update tournament name and table count
  const { error: tErr } = await supabase
    .from("tournaments")
    .update({ name: trimmed, table_count: tableCount })
    .eq("id", tournamentId);
  if (tErr) return { error: tErr.message };

  // Replace tournament_players
  await supabase
    .from("tournament_players")
    .delete()
    .eq("tournament_id", tournamentId);

  const rows = playerIds.map((pid, i) => ({
    tournament_id: tournamentId,
    player_id: pid,
    sort_order: i + 1,
  }));
  const { error } = await supabase.from("tournament_players").insert(rows);
  if (error) return { error: error.message };

  // If schedule already existed, delete it — player/table set changed
  if (rounds && rounds.length > 0) {
    const roundIds = rounds.map((r) => r.id);
    await supabase.from("games").delete().in("round_id", roundIds);
    await supabase.from("byes").delete().in("round_id", roundIds);
    await supabase.from("rounds").delete().eq("tournament_id", tournamentId);

    await supabase
      .from("tournaments")
      .update({ status: "setup" })
      .eq("id", tournamentId);
  }

  revalidatePath(`/admin/tournament/${tournamentId}`);
  return { success: true };
}

export async function completeTournament(tournamentId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("tournaments")
    .update({ status: "completed" })
    .eq("id", tournamentId);

  if (error) return { error: error.message };
  revalidatePath(`/admin/tournament/${tournamentId}`);
  return { success: true };
}
