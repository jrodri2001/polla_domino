# Polla Domino

Tournament management system for Venezuelan-style dominoes. Generates fair
matchups, tracks scores, and computes live leaderboards.

## Features

- **Player registry** — players can create accounts with a name and email.
- **Tournament setup** — choose active players and the number of tables.
- **Fair matchmaking** — distribute games and byes evenly, while minimizing
  repeated partnerships and opponents.
- **Live scorekeeping** — admins enter scores and hand-by-hand results.
- **Live updates** — tournament and leaderboard pages receive updates over
  Server-Sent Events (SSE).

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS 4 |
| Database | Local SQLite via `better-sqlite3` |
| Live updates | In-process event emitter and SSE |

## Local Development

Requirements: Node.js and npm.

```bash
npm install
npm run dev
```

Open http://localhost:3000. The app creates `data/polla.db` and its tables
automatically on first run; no external database or SQL setup is needed. The
database is stored relative to the project directory and is excluded from Git.
Keep this file to preserve your players, tournaments, and results.

You can optionally create `.env.local` in the project root:

```dotenv
AUTH_SECRET=replace-with-a-private-random-secret

# Optional: enable Google sign-in
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

Set a private `AUTH_SECRET` for deployments. For Google sign-in, configure the
OAuth redirect URI as `https://your-domain/auth/callback` (or
`http://localhost:3000/auth/callback` for local development).

New accounts have the player role. To enable tournament administration on a
fresh installation, assign the `admin` role to the desired account's row in
the local `players` table.

## Running in Production

```bash
npm run build
npm start
```

Run the app from a directory with persistent, writable storage so
`data/polla.db` survives restarts and deployments. The database is local to the
server, so use a single Node.js process/instance: the in-process event emitter
used for live updates does not synchronize across multiple processes or hosts.
Back up the SQLite database before replacing or removing it.

## Data Model

SQLite tables are initialized by `src/lib/db.ts`:

```
players            -- registered players and account roles
tournaments        -- tournament sessions
tournament_players -- players assigned to each tournament
rounds             -- numbered rounds per tournament
games              -- games per table and round (teams + scores)
byes               -- players resting per round
hands              -- hand-by-hand scores
```

The `supabase/` directory contains legacy SQL migrations; the application does
not use them at runtime.

## Algorithm Overview

The matchmaking engine lives in `src/lib/algorithm.ts`.

1. **Games per round** = `min(tables, floor(N / 4))`
2. **Byes per round** = `N - (games_per_round * 4)`
3. **Number of rounds** is chosen so that `rounds * players_per_round` is
   divisible by `N`, guaranteeing equal games per player (capped at 21).
4. Each round, the players with the fewest accumulated games are selected first
   (greedy balancing).
5. Within a round, a **scored random search** (200 shuffles for 8 or fewer
   players, 80 for larger groups) picks the arrangement that minimises repeated
   partnerships and repeated opponents.
6. For exactly 4 players, the complete round-robin (3 rounds) is returned.

### Verified test cases

| Players | Tables | Rounds | Games/player |
|---------|--------|--------|-------------|
| 4       | 1      | 3      | 3           |
| 5       | 1      | 5      | 4           |
| 6       | 1      | 6      | 4           |
| 7       | 1      | 7      | 4           |
| 8       | 1      | 8      | 4           |
| 8       | 2      | 4      | 4           |
| 10      | 2      | 5      | 4           |
| 12      | 3      | 4      | 4           |
| 13      | 2      | 13     | 8           |

Run `npx tsx src/lib/algorithm.test.ts` to verify.

## Pages

| Route | Description |
|-------|-------------|
| `/` | Home — list of tournaments |
| `/players` | View and manage players |
| `/admin` | Create a tournament |
| `/admin/tournament/[id]` | Generate schedules and enter scores |
| `/leaderboard/[id]` | Tournament leaderboard |
| `/standings` | All-time standings |
