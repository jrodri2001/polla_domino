-- ============================================
-- Soft-delete: add active flag to players
-- ============================================

ALTER TABLE players ADD COLUMN active boolean NOT NULL DEFAULT true;
