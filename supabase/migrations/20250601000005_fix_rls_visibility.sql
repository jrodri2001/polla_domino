-- Fix visibility: let all authenticated users READ profiles, tournament_players, and rounds.
-- This allows players to see standings, leaderboards, and tournament details.
-- Write operations remain admin-only.

-- Profiles: allow all authenticated users to read (needed for standings/player lists)
CREATE POLICY "all authenticated read profiles"
  ON profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Tournament players: allow all authenticated users to read (needed for leaderboard player lists and counts)
CREATE POLICY "all authenticated read tournament_players"
  ON tournament_players FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Rounds: allow all authenticated users to read (needed for standings tournament count)
CREATE POLICY "all authenticated read rounds"
  ON rounds FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Byes: allow all authenticated users to read (needed for tournament views)
CREATE POLICY "all authenticated read byes"
  ON byes FOR SELECT
  USING (auth.uid() IS NOT NULL);