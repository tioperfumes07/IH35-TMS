-- Fix (latent bug, USMCA-launch blocker): safety.ensure_company_safety_settings() is the AFTER-INSERT
-- trigger on org.companies that provisions a safety.safety_settings row for each new company. It was
-- SECURITY INVOKER, so when a company is created by the runtime role ih35_app (USMCA bootstrap /
-- bootstrapCarrier), the trigger's INSERT ran as ih35_app under RLS — and safety.safety_settings has only
-- SELECT/UPDATE policies (no INSERT), so the INSERT was blocked ("new row violates row-level security
-- policy") and the whole company-create transaction 500'd.
--
-- Fix: make the trigger function SECURITY DEFINER so provisioning runs as the function owner (which owns
-- the table / bypasses RLS) regardless of who creates the company — the correct posture for a system
-- provisioning trigger. Hardened with a fixed search_path (SECURITY DEFINER best practice). The body is
-- unchanged (single INSERT of NEW.id, ON CONFLICT DO NOTHING — no user input, no dynamic SQL). Idempotent
-- (CREATE OR REPLACE); the existing trigger already points at this function, so no trigger change needed.

CREATE OR REPLACE FUNCTION safety.ensure_company_safety_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, safety
AS $$
BEGIN
  INSERT INTO safety.safety_settings (operating_company_id)
  VALUES (NEW.id)
  ON CONFLICT (operating_company_id) DO NOTHING;
  RETURN NEW;
END
$$;
