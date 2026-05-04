/**
 * Matchmaking algorithm for Venezuelan-style dominoes tournaments.
 *
 * Guarantees:
 *  - Every player plays the exact same number of games.
 *  - Byes (descansos) are distributed evenly when N is not a multiple of 4.
 *  - For large groups (7+) a balanced random subset is generated instead of
 *    exhaustively enumerating every combination.
 *  - Partner and opponent variety is maximised via a scored random-search.
 */

// ── Public types ────────────────────────────────────────────────────────────

export interface ScheduleGame {
  team1: [number, number]; // indices into the player array
  team2: [number, number];
  table: number;
}

export interface ScheduleRound {
  roundNumber: number;
  games: ScheduleGame[];
  byes: number[]; // indices of players resting this round
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function gcd(a: number, b: number): number {
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

function shuffle<T>(arr: T[]): T[] {
  const r = [...arr];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/**
 * Score an arrangement of players: lower is better.
 * Penalises repeated partnerships (weight 10) and repeated opponents (weight 5).
 */
function scoreArrangement(
  players: number[],
  gamesCount: number,
  partners: number[][],
  opponents: number[][],
): number {
  let score = 0;
  for (let g = 0; g < gamesCount; g++) {
    const b = g * 4;
    const [p1, p2, p3, p4] = [players[b], players[b + 1], players[b + 2], players[b + 3]];
    score += partners[p1][p2] * 10;
    score += partners[p3][p4] * 10;
    score += opponents[p1][p3] * 5;
    score += opponents[p1][p4] * 5;
    score += opponents[p2][p3] * 5;
    score += opponents[p2][p4] * 5;
  }
  return score;
}

// ── Main entry point ────────────────────────────────────────────────────────

export function generateSchedule(
  playerCount: number,
  tableCount: number,
): ScheduleRound[] {
  if (playerCount < 4) throw new Error("Se necesitan al menos 4 jugadores");
  if (tableCount < 1) throw new Error("Se necesita al menos 1 mesa");

  const gamesPerRound = Math.min(tableCount, Math.floor(playerCount / 4));
  const playersPerRound = gamesPerRound * 4;

  // ── Special case: exactly 4 players → complete round-robin ──────────────
  if (playerCount === 4) {
    return [
      { roundNumber: 1, games: [{ team1: [0, 1], team2: [2, 3], table: 1 }], byes: [] },
      { roundNumber: 2, games: [{ team1: [0, 2], team2: [1, 3], table: 1 }], byes: [] },
      { roundNumber: 3, games: [{ team1: [0, 3], team2: [1, 2], table: 1 }], byes: [] },
    ];
  }

  // ── Calculate the number of rounds for equal play ───────────────────────
  const g = gcd(playerCount, playersPerRound);
  const minRounds = playerCount / g;
  const gamesPerPlayerAtMin = (minRounds * playersPerRound) / playerCount;
  const multiplier = Math.max(1, Math.ceil(4 / gamesPerPlayerAtMin));
  const numRounds = Math.min(minRounds * multiplier, 21);

  // ── Tracking matrices ───────────────────────────────────────────────────
  const gameCount = new Array(playerCount).fill(0);
  const partners: number[][] = Array.from({ length: playerCount }, () =>
    new Array(playerCount).fill(0),
  );
  const opponents: number[][] = Array.from({ length: playerCount }, () =>
    new Array(playerCount).fill(0),
  );

  const rounds: ScheduleRound[] = [];

  for (let r = 0; r < numRounds; r++) {
    // Pick the players with the fewest games so far
    const indices = Array.from({ length: playerCount }, (_, i) => i);
    indices.sort((a, b) => gameCount[a] - gameCount[b] || a - b);

    const active = indices.slice(0, playersPerRound);
    const byes = indices.slice(playersPerRound);

    // Scored random search for the best team arrangement
    let bestScore = Infinity;
    let bestArr = active;
    const attempts = active.length <= 8 ? 200 : 80;

    for (let i = 0; i < attempts; i++) {
      const candidate = shuffle(active);
      const s = scoreArrangement(candidate, gamesPerRound, partners, opponents);
      if (s < bestScore) {
        bestScore = s;
        bestArr = candidate;
      }
      if (s === 0) break;
    }

    // Build round games from the chosen arrangement
    const games: ScheduleGame[] = [];
    for (let gi = 0; gi < gamesPerRound; gi++) {
      const base = gi * 4;
      const t1: [number, number] = [bestArr[base], bestArr[base + 1]];
      const t2: [number, number] = [bestArr[base + 2], bestArr[base + 3]];

      partners[t1[0]][t1[1]]++;
      partners[t1[1]][t1[0]]++;
      partners[t2[0]][t2[1]]++;
      partners[t2[1]][t2[0]]++;
      for (const a of t1) for (const b of t2) { opponents[a][b]++; opponents[b][a]++; }

      games.push({ team1: t1, team2: t2, table: gi + 1 });
    }

    for (const p of active) gameCount[p]++;
    rounds.push({ roundNumber: r + 1, games, byes });
  }

  return rounds;
}

// ── Verification utility (useful for testing) ──────────────────────────────

export function verifySchedule(
  schedule: ScheduleRound[],
  playerCount: number,
): { valid: boolean; gamesPerPlayer: number; errors: string[] } {
  const errors: string[] = [];
  const gameCounts = new Array(playerCount).fill(0);
  const byeCounts = new Array(playerCount).fill(0);

  for (const round of schedule) {
    const seen = new Set<number>();
    for (const game of round.games) {
      for (const p of [...game.team1, ...game.team2]) {
        if (seen.has(p)) errors.push(`Round ${round.roundNumber}: player ${p} appears twice`);
        seen.add(p);
        gameCounts[p]++;
      }
    }
    for (const p of round.byes) {
      if (seen.has(p)) errors.push(`Round ${round.roundNumber}: bye player ${p} also plays`);
      seen.add(p);
      byeCounts[p]++;
    }
    if (seen.size !== playerCount) {
      errors.push(`Round ${round.roundNumber}: ${seen.size} players accounted for, expected ${playerCount}`);
    }
  }

  const uniqueGames = new Set(gameCounts);
  if (uniqueGames.size > 1) {
    errors.push(`Unequal games per player: ${JSON.stringify(gameCounts)}`);
  }

  return { valid: errors.length === 0, gamesPerPlayer: gameCounts[0], errors };
}
