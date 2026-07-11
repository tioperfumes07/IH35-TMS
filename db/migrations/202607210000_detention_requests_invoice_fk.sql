-- [HOLD-FOR-JORGE — TIER 1] DO NOT RUN ON PROD — run ONLY on a Neon branch by Jorge's hand, then
-- ledger-backfill so prod db:migrate skips it. Registered in db/migrations/.held-migrations.json.
-- P3-INVOICE-FK (residual) — enforce the detention -> invoice linkage.
-- Verify-first (2026-07-11): the other P3-INVOICE-FK gaps are ALREADY closed — invoice_lines.account_id
-- FK -> catalogs.accounts (migration 0221), and invoices/invoice_lines.source_load_id FK -> mdata.loads
-- (migration 0060, inline REFERENCES — the dispatch's "index only" claim was stale). The ONE remaining
-- gap: dispatch.detention_requests.invoice_id / invoice_line_id are soft uuids with NO FK, so a detention
-- request can reference a non-existent invoice/line. Add both FKs as NOT VALID (enforces NEW rows without
-- failing on any pre-existing orphan; GUARD runs the orphan check + VALIDATE on the Neon branch). Cross-
-- schema FK dispatch.* -> accounting.* (both canonical, NOT RETIRE). Invoices are void-not-delete, so no
-- ON DELETE action is needed. Idempotent; additive-only. Tier-1 (financial-adjacent) — build-and-hold.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'detention_requests_invoice_id_fkey') THEN
    ALTER TABLE dispatch.detention_requests
      ADD CONSTRAINT detention_requests_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES accounting.invoices(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'detention_requests_invoice_line_id_fkey') THEN
    ALTER TABLE dispatch.detention_requests
      ADD CONSTRAINT detention_requests_invoice_line_id_fkey
      FOREIGN KEY (invoice_line_id) REFERENCES accounting.invoice_lines(id) NOT VALID;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_detention_requests_invoice_id
  ON dispatch.detention_requests (invoice_id)
  WHERE invoice_id IS NOT NULL;

COMMIT;
