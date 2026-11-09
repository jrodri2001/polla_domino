const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const dumpPath = path.join(__dirname, "../data/supabase_dump.json");
const dbPath = path.join(__dirname, "../data/polla.db");

if (!fs.existsSync(dumpPath)) {
  console.error("Dump file not found:", dumpPath);
  process.exit(1);
}

const dump = JSON.parse(fs.readFileSync(dumpPath, "utf8"));
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = OFF"); // Turn off during bulk load

console.log("Starting migration into SQLite...");

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    active INTEGER NOT NULL DEFAULT 1,
    auth_id TEXT UNIQUE,
    role TEXT NOT NULL DEFAULT 'player',
    password_hash TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tournaments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    table_count INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'setup',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tournament_players (
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    sort_order INTEGER,
    PRIMARY KEY (tournament_id, player_id)
  );

  CREATE TABLE IF NOT EXISTS rounds (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    table_number INTEGER NOT NULL,
    team1_player1 TEXT NOT NULL REFERENCES players(id),
    team1_player2 TEXT NOT NULL REFERENCES players(id),
    team2_player1 TEXT NOT NULL REFERENCES players(id),
    team2_player2 TEXT NOT NULL REFERENCES players(id),
    team1_score INTEGER,
    team2_score INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    salidor_player_id TEXT REFERENCES players(id)
  );

  CREATE TABLE IF NOT EXISTS byes (
    round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    PRIMARY KEY (round_id, player_id)
  );

  CREATE TABLE IF NOT EXISTS hands (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    hand_number INTEGER NOT NULL,
    team1_points INTEGER NOT NULL DEFAULT 0,
    team2_points INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (game_id, hand_number)
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tournament_players_tournament ON tournament_players(tournament_id);
  CREATE INDEX IF NOT EXISTS idx_tournament_players_player ON tournament_players(player_id);
  CREATE INDEX IF NOT EXISTS idx_rounds_tournament ON rounds(tournament_id);
  CREATE INDEX IF NOT EXISTS idx_games_round ON games(round_id);
  CREATE INDEX IF NOT EXISTS idx_hands_game ON hands(game_id);
  CREATE INDEX IF NOT EXISTS idx_byes_round ON byes(round_id);
`);

const insertPlayer = db.prepare(`
  INSERT OR REPLACE INTO players (id, name, email, active, auth_id, role, password_hash, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertTournament = db.prepare(`
  INSERT OR REPLACE INTO tournaments (id, name, table_count, status, created_at)
  VALUES (?, ?, ?, ?, ?)
`);

const insertTP = db.prepare(`
  INSERT OR REPLACE INTO tournament_players (tournament_id, player_id, sort_order)
  VALUES (?, ?, ?)
`);

const insertRound = db.prepare(`
  INSERT OR REPLACE INTO rounds (id, tournament_id, round_number)
  VALUES (?, ?, ?)
`);

const insertGame = db.prepare(`
  INSERT OR REPLACE INTO games (id, round_id, table_number, team1_player1, team1_player2, team2_player1, team2_player2, team1_score, team2_score, status, salidor_player_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertBye = db.prepare(`
  INSERT OR REPLACE INTO byes (round_id, player_id)
  VALUES (?, ?)
`);

const insertHand = db.prepare(`
  INSERT OR REPLACE INTO hands (id, game_id, hand_number, team1_points, team2_points, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const defaultHash = bcrypt.hashSync("Domino2026!", 10);

const migrate = db.transaction(() => {
  // Clear any existing tables
  db.exec(`
    DELETE FROM hands;
    DELETE FROM byes;
    DELETE FROM games;
    DELETE FROM rounds;
    DELETE FROM tournament_players;
    DELETE FROM tournaments;
    DELETE FROM players;
  `);

  let playerCount = 0;
  for (const p of dump.players || []) {
    if (p.email && p.email.startsWith("temp_export_")) continue;
    insertPlayer.run(
      p.id,
      p.name,
      p.email,
      p.active ? 1 : 0,
      p.auth_id,
      p.role || "player",
      defaultHash,
      p.created_at || new Date().toISOString()
    );
    playerCount++;
  }
  console.log(`Migrated ${playerCount} players (default password: Domino2026!)`);

  let tCount = 0;
  for (const t of dump.tournaments || []) {
    insertTournament.run(t.id, t.name, t.table_count, t.status || "setup", t.created_at || new Date().toISOString());
    tCount++;
  }
  console.log(`Migrated ${tCount} tournaments`);

  let tpCount = 0;
  for (const tp of dump.tournament_players || []) {
    insertTP.run(tp.tournament_id, tp.player_id, tp.sort_order ?? null);
    tpCount++;
  }
  console.log(`Migrated ${tpCount} tournament_players`);

  let rCount = 0;
  for (const r of dump.rounds || []) {
    insertRound.run(r.id, r.tournament_id, r.round_number);
    rCount++;
  }
  console.log(`Migrated ${rCount} rounds`);

  let gCount = 0;
  for (const g of dump.games || []) {
    insertGame.run(
      g.id,
      g.round_id,
      g.table_number,
      g.team1_player1,
      g.team1_player2,
      g.team2_player1,
      g.team2_player2,
      g.team1_score ?? null,
      g.team2_score ?? null,
      g.status || "pending",
      g.salidor_player_id ?? null
    );
    gCount++;
  }
  console.log(`Migrated ${gCount} games`);

  let bCount = 0;
  for (const b of dump.byes || []) {
    insertBye.run(b.round_id, b.player_id);
    bCount++;
  }
  console.log(`Migrated ${bCount} byes`);

  let hCount = 0;
  for (const h of dump.hands || []) {
    insertHand.run(
      h.id,
      h.game_id,
      h.hand_number,
      h.team1_points || 0,
      h.team2_points || 0,
      h.created_at || new Date().toISOString()
    );
    hCount++;
  }
  console.log(`Migrated ${hCount} hands`);
});

migrate();
db.pragma("foreign_keys = ON");
console.log("Migration complete!");
