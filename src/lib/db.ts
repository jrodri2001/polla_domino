import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dbDirectory = path.join(process.cwd(), "data");
if (!fs.existsSync(dbDirectory)) {
  fs.mkdirSync(dbDirectory, { recursive: true });
}

const dbPath = path.join(dbDirectory, "polla.db");

// Singleton across HMR in dev
declare global {
  // eslint-disable-next-line no-var
  var __pollaDb: Database.Database | undefined;
}

function initDb(): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

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

  return db;
}

export const db: Database.Database = globalThis.__pollaDb ?? (globalThis.__pollaDb = initDb());
