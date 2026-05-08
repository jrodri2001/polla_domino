-- Track which player started the game ("el salidor")
ALTER TABLE games ADD COLUMN salidor_player_id uuid REFERENCES players(id);