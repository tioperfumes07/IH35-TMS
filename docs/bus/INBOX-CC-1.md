# CC-1 / Claude Code INBOX · MONEY LANE · HONEST BUILT · Live=BLOCKED

**Boot (mandatory):**  
1. `docs/lockdown/FULLY-WIRED-COMPLETE-BAR-2026-08-13.md`  
2. `docs/lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md` ← seat lanes + theater ban  
3. This INBOX → board OPEN money rows → ship  

## ☐ NOW (CC-1 permanent sequence)

1. **Kill money theater** — `ap_bill` `leafRe:".*"` first; any money-col `|.*` / count-floor Built  
2. **Fix money-path reverse gaps** — settlements / factoring / banking / accounting (filed board rows; product UI + JE/bill truth)  
3. Honest sweep + fix: `gl_je` → `liability` → `ap_bill` → `expense` → `bank` → `invoice` / `payment` / `settlement` / `factor` / `escrow`  
4. Parallel OK with Cursor/Codex on *their* surfaces — never claim money “complete” while theater or filed money gaps remain  

**FORBIDDEN:** “Done / 0 gaps / launch-ready” soft language · new scoreboard columns · permanent 5th Verified Box · bundling dozens of unrelated gap fixes in one PR  

Every PR **REMAINING:** `Live=BLOCKED · theater_broad_remaining:<n> · filed_gaps_remaining:<ids>`

## ☐ CODEX HANDOFFS · VERIFIED OPEN

These are mirrored from the live Desktop CC-1 queue. The detailed canonical rows, dependencies, and `BLOCKS=` values are in `docs/audit/GUARD-WORKORDERS.md`.

1. `HOLD-DEDUCTION-MODAL-WRONG-PATCH-TARGET-ID` — `apps/frontend/src/pages/driver-finance/components/HoldDeductionModal.tsx`; `DeductionsSection.tsx`; `SettlementDetailPage.tsx:50-61`; `apps/backend/src/driver-finance/deductions.routes.ts:112-155`; `db/migrations/0138_p8b_j_pr3_driver_finance_stack.sql:57-71`. Trace the posting source of truth across the three deduction tables; the current settlement-line UUID cannot identify a deduction-schedule row.
2. `LINK-F5170-F5171-CUSTOMER-PAYMENT-HISTORY-SCOPE-LABEL` — `apps/frontend/src/api/customers.ts:52-56` omits required `operating_company_id`; `apps/backend/src/accounting/customer-payments.routes.ts:30,57-112` omits `p.display_id`; `apps/frontend/src/pages/CustomerDetail.tsx:2251-2256` consequently cannot render canonical payment identity. Fix scope and display identity together; do not change posting.
3. `GUARD-MANUAL-JE-HUB-NO-MUTATION-PROOF` — `scripts/verify-manual-je-hub-create.mjs` is the only current leaf-tagged guard with no planted-defect mode. Add named injectable sources and independent mutations for its hub/list/topbar/modal/URL-sync and removed-threshold contracts; preserve its exact JE leaves and 2026-07-22 owner ruling.
4. `LIABILITY-PRE-SETTLEMENT-DROP-GUARD-DRIFT` — `verify-maint-bill-factoring-liab-built.mjs` is red because `PreSettlementsPanel.tsx:70` now mounts `kind="liability"` while `accounting:pre_settlements` still drops liability. Prove applicability and restore the exact cell/link contract, or remove misleading UI; do not delete only the assertion.
5. `REPORTS-GL-JE-SETTLEMENT-SELFTEST-DRIFT` — `verify-reports-gl-je-final-leaves.mjs --selftest` is red at `settlement-required`; the mutation anchors on removed `"vendor",` and is inert. Re-anchor to the current settlement-summary Required array while preserving the honest no-single-JE rule.
6. `BILL-EXPENSE-CATEGORY-PICKER-RAW-UUID-FALLBACK` — `components/forms/TwoSectionLineEditor.tsx:129-145` makes bill-mode expense-category picker labels fall through to `String(row.id)` when display name/code are absent; existing entity-label guard covers only the separate CoA fallback. Use `entityLabel` for the category row and mutation-prove removal while preserving the real category FK/code payload.
7. `AUTO-DEDUCTION-POLICY-HISTORY-NO-HUMAN-LABEL` — `settlements/auto-deductions/policy.routes.ts` joins `catalogs.driver_deduction_types` but omits its display name; `FinesDeductionsCard.tsx:317-333` consequently renders every completed policy through `entityLabel(null, policy.id, "Policy")`. Project/type/consume the canonical type label and mutation-prove serializer + UI without changing amounts.
8. `RECORD-EXPENSE-SUGGESTED-LOAD-RAW-UUID-LABEL` — `components/expenses/RecordExpenseForm.tsx:114-126` stamps the correct suggested load FK but uses `suggested.load_number || suggested.load_id` as visible identity. Route the label through `entityLabel`, preserve `loadId` and override pinning, and mutation-prove the raw-ID removal in the expense suggest-load guard.

`REVERSE-SECTIONS-SILENT-LIST-CAPS` — **FIXED (CC-1, 2026-08-15)**, see `docs/audit/GUARD-WORKORDERS.md`. Removed from this queue.
`FIXED-ASSETS-DEPRECIATION-GL-POSTING-NOT-BUILT` — **CORRECTED + FIXED (ACCT-F5302, CC-1, 2026-08-15)** — premise was stale (a posting engine already existed and was already live for TRK/USMCA); the real gap was the FE reverse-link, now built. See `docs/audit/GUARD-WORKORDERS.md`. Removed from this queue.
`AUDIT-REPORT-JE-SUBJECT-TYPE-MISCATEGORIZED` — **FIXED (ACCT-F5303, CC-1, 2026-08-15)**, see `docs/audit/GUARD-WORKORDERS.md`. Removed from this queue.

Codex owns no implementation in these protected money paths. Each item remains OPEN until its product PR and exact guard are merged.

## ☐ MY OWN 76-ITEM ORPHAN-GUARD SLICE — 5 CONFIRMED RED (verified live 2026-08-15, after #7208)

`docs/audit/ORPHAN-GUARD-OWNER-HANDOFF-2026-08-15.md` itemizes 76 money/accounting/banking/factoring/settlements
guards that exist but never run in CI (registry hygiene, no Built credit either way). I ran all 76 live: 71
pass silently (just need `verify-steps/` wiring, batch that mechanically like Codex's Wave batches — no
product work). **5 are actually RED — real defects, not just unwired:**

1. `verify-accounting-required-linkage-honest.mjs` — first-5 linkage Required cells = 35, ceiling is 27
   (Required-column inflation is back — find what re-added the false cells)
2. `verify-factoring-required-liability-honest.mjs` — `factoring.home.reserve_tracker` lost its required `liability`
3. `verify-fleet-gl-je-required-honest.mjs` — 3 leaves lost required `gl_je`: `unit.profile.bank_txns`,
   `unit.detail.finance_linkage`, `trailer.profile.bank_txns`
4. `verify-wave-c-invoice-bank-batch5.mjs` — `DriverEscrowTabContent.tsx` no longer renders a real
   `escrow_balance` — this is a genuine UI/data regression, not Required-JSON drift
5. `verify-maint-bill-factoring-liab-built.mjs` — duplicate of item 4 above in the CODEX HANDOFFS list

**Priority: these 5 rank ABOVE the 8-item Codex-handoff queue** — they're live regressions found this session,
not filed-and-waiting. Fix root cause, ratchet the wiring into `verify-steps/` in the same PR, then batch-wire
the remaining 71 mechanically.

## ☐ CODEX-ZERO-REMAINDER-PROTECTED-MONEY-20 — itemized, NOT yet independently re-verified by me

`CODEX-ZERO-REMAINDER-PROTECTED-MONEY-20` (board, filed by Codex audit) lists 20 exact money-bearing
Required leaves across `accounting.required.json` / `banking.required.json` still missing their owed
connectivity/reverse obligation. I have not personally re-run each of the 20 live yet — do that before fixing,
not after (verify-everything-never-guess law). Full leaf list is on the board row itself.

## LAW LOCK
Canonical launch definition: Fully-Wired 1–11 honest + Live last — `HONEST-BUILT-LAUNCH-LAW-2026-08-14` + `FULLY-WIRED-COMPLETE-BAR-2026-08-13`. Live Chrome (item 12) is Cursor-led with Codex assisting per owner directive 2026-08-15 — CC-1 stays on Built-honest (items 1–11); do not get pulled into item-12 clicking.
