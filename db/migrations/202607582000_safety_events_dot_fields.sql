-- S-07 / safety-dot-fields FIX A: FMCSA 49 CFR 390.15 DOT fields on safety.safety_events.
-- Column names match prod-proven safety.accidents (Neon br-fancy-credit-akjnd07a, 2026-07-17).
-- hazmat_release intentionally omitted — not present on safety.accidents prod schema.

BEGIN;

ALTER TABLE safety.safety_events
  ADD COLUMN IF NOT EXISTS location_text text,
  ADD COLUMN IF NOT EXISTS injury_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fatality_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tow_away_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dot_reportable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS police_report_number text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_safety_events_injury_count_nonneg'
  ) THEN
    ALTER TABLE safety.safety_events
      ADD CONSTRAINT chk_safety_events_injury_count_nonneg CHECK (injury_count >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_safety_events_fatality_count_nonneg'
  ) THEN
    ALTER TABLE safety.safety_events
      ADD CONSTRAINT chk_safety_events_fatality_count_nonneg CHECK (fatality_count >= 0);
  END IF;
END
$$;

COMMIT;
