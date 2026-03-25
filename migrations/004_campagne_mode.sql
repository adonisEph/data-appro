-- Migration 004 — Mode campagne (auto vs manuel)

ALTER TABLE campagnes ADD COLUMN mode TEXT NOT NULL DEFAULT 'auto'
  CHECK (mode IN ('auto', 'manuel'));
