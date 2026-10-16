-- CC-3 · LEAD 443.168 J — description -> payee suggestion WITH ITS REASON (owner Law B 2026-09-12: "it suggests" — ranked
-- suggestions with the reason; a human accepts, rejects or changes). A money-IN line's payee is a CUSTOMER (the line had
-- only suggested_vendor_id), and every suggestion carries the human sentence that explains it (the bank rule's text, or the
-- pattern read from the bank description). Suggestion columns only: nothing here writes a categorization or a match.
-- Additive, nullable, idempotent; no rows written.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS suggested_customer_id uuid REFERENCES mdata.customers(id),
  ADD COLUMN IF NOT EXISTS suggested_reason text;

COMMENT ON COLUMN banking.bank_transactions.suggested_customer_id IS
  'LEAD 443.168 J: the suggested payee of a money-in line (a customer). Suggestion only (Law B) — the human accept writes categorization_customer_id.';
COMMENT ON COLUMN banking.bank_transactions.suggested_reason IS
  'LEAD 443.168 J: why the suggestion was made (bank rule text / the payee read from the bank description). Shown beside the suggestion.';

COMMIT;
