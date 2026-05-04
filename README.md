# Polla Domino

Tournament management system for Venezuelan-style dominoes. Generates fair
matchups, tracks scores in real-time, and computes a live leaderboard.

## Features

- **Player registry** — add players by name and email.
- **Tournament setup** — pick active players, set the number of physical tables.
- **Fair matchmaking algorithm** — every player plays the exact same number of
  games; byes (descansos) are distributed evenly; for 7+ players a balanced
  random subset is generated instead of exhausting every combination.
- **Live scorekeeping** — admin enters scores per game.
- **Real-time leaderboard** — standings update instantly via Supabase Realtime.

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS 4 |
| Database / Realtime | Supabase (Postgres + Realtime) |

## Data Model

```
players            -- registered players
tournaments        -- tournament sessions
tournament_players -- junction (N:M)
rounds             -- numbered rounds per tournament
games              -- 1 game per table per round (teams + scores)
byes               -- players resting per round
```

Full SQL schema: `supabase/migrations/001_initial.sql`

## Setup

### 1. Create a Supabase project

Go to https://supabase.com and create a free project.

### 2. Run the migration

Open the **SQL Editor** in your Supabase dashboard and paste the contents of
`supabase/migrations/001_initial.sql`. Execute.

### 3. Enable Realtime

In the Supabase dashboard go to **Database > Replication** and make sure the
`games` table is included in the `supabase_realtime` publication (the migration
does this, but verify).

### 4. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from
your Supabase project settings > API.

### 5. Install and run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

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
| `/players` | Register and manage players |
| `/admin` | Create a new tournament |
| `/admin/tournament/[id]` | Generate schedule, enter scores |
| `/leaderboard/[id]` | Real-time leaderboard |
