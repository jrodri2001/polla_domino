import { generateSchedule, verifySchedule } from "./algorithm";

function test(label: string, playerCount: number, tableCount: number) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`TEST: ${label} — ${playerCount} players, ${tableCount} table(s)`);
  console.log("=".repeat(60));

  const schedule = generateSchedule(playerCount, tableCount);
  const result = verifySchedule(schedule, playerCount);

  console.log(`Rounds: ${schedule.length}`);
  console.log(`Games per player: ${result.gamesPerPlayer}`);

  for (const round of schedule) {
    const gamesStr = round.games
      .map(
        (g) =>
          `${g.team1[0] + 1}-${g.team1[1] + 1} vs ${g.team2[0] + 1}-${g.team2[1] + 1}`,
      )
      .join(" | ");
    const byesStr =
      round.byes.length > 0
        ? ` (Descansan: ${round.byes.map((b) => b + 1).join(",")})`
        : "";
    console.log(`  R${round.roundNumber}: ${gamesStr}${byesStr}`);
  }

  if (result.valid) {
    console.log(`✅ VALID — each player plays exactly ${result.gamesPerPlayer} game(s)`);
  } else {
    console.log("❌ INVALID");
    for (const e of result.errors) console.log(`   - ${e}`);
  }
}

test("4 Players (Complete Round Robin)", 4, 1);
test("5 Players", 5, 1);
test("6 Players", 6, 1);
test("7 Players", 7, 1);
test("8 Players, 1 Table", 8, 1);
test("8 Players, 2 Tables", 8, 2);
test("10 Players, 2 Tables", 10, 2);
test("12 Players, 3 Tables", 12, 3);
test("13 Players, 2 Tables", 13, 2);
