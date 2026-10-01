-- 202615190800_factoring_purchase_docs_override.sql
-- Owner 2026-10-01 (in chat to CC-2): "WE NEED TO CREATE AN OVERRIDE APPROVAL." A factoring purchase is sent to the factor
-- only when every load carries its BOL / POD / rate confirmation; the Owner may approve sending without them, with a reason.
-- The approval is stamped on the purchase document (who, when, why) and audited; it never touches the GL. Additive.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE accounting.factoring_purchases ADD COLUMN IF NOT EXISTS docs_override_at timestamptz;
ALTER TABLE accounting.factoring_purchases ADD COLUMN IF NOT EXISTS docs_override_by_user_id uuid REFERENCES identity.users(id);
ALTER TABLE accounting.factoring_purchases ADD COLUMN IF NOT EXISTS docs_override_reason text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'factoring_purchases_docs_override_stamped' AND conrelid = 'accounting.factoring_purchases'::regclass) THEN
    ALTER TABLE accounting.factoring_purchases ADD CONSTRAINT factoring_purchases_docs_override_stamped
      CHECK ((docs_override_at IS NULL) = (docs_override_by_user_id IS NULL)
         AND (docs_override_at IS NULL) = (docs_override_reason IS NULL)
         AND (docs_override_reason IS NULL OR length(btrim(docs_override_reason)) >= 10));
  END IF;
END $$;
COMMENT ON COLUMN accounting.factoring_purchases.docs_override_reason IS
  'Owner override approval: why this purchase was sent to the factor without every load''s BOL / POD / rate confirmation.';
COMMIT;
