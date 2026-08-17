-- FINDING: LV-USMCA-CATEGORIZATION-RULES-DEAD-PATTERNS — found live 2026-08-16 while performing the
-- assigned banking-deep live-verify of USMCA's Auto-Categorize Rules page.
--
-- ROOT CAUSE: USMCA has exactly 2 active banking.transaction_categories rows —
-- ('AUTO_MAINTENANCE' -> 5400 Truck Repairs & Maintenance) and ('FUEL' -> 5000 Fuel & Diesel) — both
-- priority 5. autoCategorize()/scoreRuleMatch() in apps/backend/src/integrations/plaid/plaid.service.ts
-- match plaid_category_pattern as a case-insensitive substring against each element of Plaid's real
-- personal_finance_category array (e.g. ["TRANSPORTATION","TRANSPORTATION_GAS"] or
-- ["GENERAL_SERVICES","GENERAL_SERVICES_AUTOMOTIVE"]). Neither "AUTO_MAINTENANCE" nor "FUEL" is a
-- substring of any element Plaid actually sends for USMCA's live Bank of America feed, so these 2
-- rules can NEVER match a real transaction — they have been dead since creation.
--
-- LIVE-MEASURED IMPACT (USMCA, pending/uncategorized bank_transactions, 2026-08-16): of 160 rows stuck
-- in the For-review backlog, 39 carry ["TRANSPORTATION","TRANSPORTATION_GAS"], 10 carry
-- ["GENERAL_SERVICES","GENERAL_SERVICES_AUTOMOTIVE"], and 2 carry
-- ["TRANSPORTATION","TRANSPORTATION_PUBLIC_TRANSIT"] (Plaid mislabels some fuel-stop purchases this
-- way — the same mislabeling TRANSP's own 202606280930 seed migration already documents and works
-- around by matching the broad TRANSPORTATION parent, not just GAS_STATIONS/FUEL). That is 51 of 160
-- (32%) of the entire USMCA backlog that a correctly-patterned rule would have auto-categorized.
--
-- FIX: add 2 new rows using patterns that actually appear in USMCA's live feed, reusing the SAME
-- 2 already-mapped, already-verified USMCA accounts (5000 Fuel & Diesel, 5400 Truck Repairs &
-- Maintenance) — no new account is introduced. Mirrors the proven TRANSP convention exactly: a broad
-- parent pattern (TRANSPORTATION) at a lower priority number below the existing dead rows so the
-- leaf-specific GENERAL_SERVICES_AUTOMOTIVE rule (which scores higher via scoreRuleMatch's leaf-tier)
-- still wins when both could apply. The 2 original dead-pattern rows are left untouched (additive,
-- harmless, matches TRANSP's own inclusion of narrow inert patterns like AUTO_PARTS/AUTO_DEALERS
-- pending future Plaid taxonomy variants) — this migration does not delete or edit any existing row.
--
-- SCOPE: USMCA operating company ONLY. Suggestion/auto-categorize only — does not post to GL, does
-- not write journal entries, does not flip any flag. BANK_FEED_GL_POSTING_ENABLED already governs
-- posting for USMCA independently of this rule set (unchanged by this migration).
--
-- Idempotent: guarded by a NOT EXISTS check per (operating_company_id, plaid_category_pattern) since
-- banking.transaction_categories carries no unique constraint on that pair (verified live 2026-08-16 —
-- only transaction_categories_pkey and a non-unique (operating_company_id, priority) index exist).
-- Additive: does not alter or drop any existing row.

BEGIN;

INSERT INTO banking.transaction_categories (
  operating_company_id,
  plaid_category_pattern,
  coa_account_id,
  priority,
  is_active
)
SELECT c.id, m.pattern, m.account_id::uuid, m.priority, true
FROM org.companies c
CROSS JOIN (
  VALUES
    -- Leaf-specific: real truck-maintenance/repair spend (Rush Truck Centers, South TX Truck Centers,
    -- Love's Tire Care) — Plaid's actual leaf category for these is GENERAL_SERVICES_AUTOMOTIVE.
    ('GENERAL_SERVICES_AUTOMOTIVE', '8fe4f37c-39ae-48df-a0f9-f43489f3df5d', 10),
    -- Broad parent: catches TRANSPORTATION_GAS (real fuel stops) AND TRANSPORTATION_PUBLIC_TRANSIT
    -- (Plaid mislabels some fuel-stop purchases this way; same fallback TRANSP already relies on).
    ('TRANSPORTATION', '353fbd5b-d39c-4709-ac19-60cae52018f7', 20)
) AS m(pattern, account_id, priority)
WHERE c.code = 'USMCA'
  AND c.is_active = true
  AND c.deactivated_at IS NULL
  AND EXISTS (SELECT 1 FROM catalogs.accounts a WHERE a.id = m.account_id::uuid)
  AND NOT EXISTS (
    SELECT 1 FROM banking.transaction_categories tc
    WHERE tc.operating_company_id = c.id
      AND tc.plaid_category_pattern = m.pattern
  );

-- Drift-capture signal: expect 2 new rows landing on prod (4 total active rows for USMCA); 0 on bare
-- CI (no USMCA company/accounts seeded).
SELECT
  count(*) AS usmca_transaction_categories_active,
  'USMCA-only, suggestion-only, no GL writes, additive' AS scope_note
FROM banking.transaction_categories tc
JOIN org.companies c ON c.id = tc.operating_company_id
WHERE c.code = 'USMCA' AND tc.is_active = true;

COMMIT;
