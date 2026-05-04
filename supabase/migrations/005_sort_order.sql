-- Add sort_order to tournament_players to persist the random draw order
ALTER TABLE tournament_players ADD COLUMN sort_order integer;

-- Backfill existing rows with a sequential order based on player_id
WITH numbered AS (
  SELECT tournament_id, player_id,
         ROW_NUMBER() OVER (PARTITION BY tournament_id ORDER BY player_id) AS rn
  FROM tournament_players
)
UPDATE tournament_players tp
SET sort_order = n.rn
FROM numbered n
WHERE tp.tournament_id = n.tournament_id AND tp.player_id = n.player_id;