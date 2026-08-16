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

**NEW OWNER-DECIDED:** `INV-PURCHASE-LEDGER-SOR-STOCK-UPSERT` — implement the approved append-only `maintenance.parts_purchases` WORM ledger, company+part-number stock uniqueness/upsert, atomic purchase+stock mutation, symmetric void reversal, scoped read/UI, and preserve the existing flag-gated GL sibling with no QBO write-back. Exact decision, paths, acceptance, and `BLOCKS=LIVE-INVENTORY-PURCHASE-HISTORY` are on the board and in `docs/blocks/HOLD-INVENTORY-PURCHASE-HISTORY-SOR.md`. `OWNER-GATED=no`; approved in chat 2026-08-15.

**NEW LIVE HANDOFF:** `LV-INVENTORY-PURCHASE-HISTORY-CREATOR-UNREACHABLE` — PR #7368 is deployed and guarded, but live USMCA Purchase History directs operators to Inventory Parts & Stock, whose only actions are Create part/Edit. The real money-bearing + Record Purchase creator is stranded in Maintenance's separate `PartsInventoryTable`. Reuse/extract one canonical creator across both surfaces, preserving vendor picker, MoneyInput, scoped POST, stock+history invalidation and flag-gated GL result; mutation-prove both doors and live-prove one labeled USMCA receipt after deploy. Exact paths and acceptance are on the board. `OWNER-GATED=no`; `BLOCKS=LIVE-INVENTORY-PURCHASE-HISTORY-CREATE`.

The prior 7-item handoff queue is closed; see the FIXED notes below and `docs/audit/GUARD-WORKORDERS.md` for full detail. `CLS-BOX-IN-BOX-MONEYINPUT-OUTER-FRAME` is also FIXED in PR #7298.

`REVERSE-SECTIONS-SILENT-LIST-CAPS` — **FIXED (CC-1, 2026-08-15)**, see `docs/audit/GUARD-WORKORDERS.md`. Removed from this queue.
`LINK-F5170-F5171-CUSTOMER-PAYMENT-HISTORY-SCOPE-LABEL` — **FIXED (ACCT-F5309, CC-1, 2026-08-15, PR #7280)** — `listCustomerPayments` never sent `operating_company_id` against a backend schema that requires it (non-optional uuid), so every call 400'd and rendered as a false-empty "No payments recorded"; backend SELECT now projects `p.display_id`, frontend sends scope and renders `entityLabel(p.display_id, ...)`. See `docs/audit/GUARD-WORKORDERS.md`. Removed from this queue.
`FIXED-ASSETS-DEPRECIATION-GL-POSTING-NOT-BUILT` — **CORRECTED + FIXED (ACCT-F5302, CC-1, 2026-08-15)** — premise was stale (a posting engine already existed and was already live for TRK/USMCA); the real gap was the FE reverse-link, now built. See `docs/audit/GUARD-WORKORDERS.md`. Removed from this queue.
`AUDIT-REPORT-JE-SUBJECT-TYPE-MISCATEGORIZED` — **FIXED (ACCT-F5303, CC-1, 2026-08-15)**, see `docs/audit/GUARD-WORKORDERS.md`. Removed from this queue.
`LIABILITY-PRE-SETTLEMENT-DROP-GUARD-DRIFT` — **FIXED (ACCT-F5308, CC-1, 2026-08-15)** — `pre_settlements` genuinely earned `liability` (LINK-F5187 added a real per-row `EntityLink kind="liability"`); moved FORBIDDEN→MUST_KEEP, restored to `accounting.required.json`. See `docs/audit/GUARD-WORKORDERS.md`. Removed from this queue.
`HOLD-DEDUCTION-MODAL-WRONG-PATCH-TARGET-ID` — **FIXED (CC-1, 2026-08-15, PR #7265)** — traced all three deduction tables live: `driver_finance.driver_settlement_deductions` is the real GL-posted ledger (settlement-deduction-cap.service.ts / settlement-posting.service.ts), `deduction_schedule` is an unrelated cash-advance/liability feature never wired into the settlement engine. Reused settlement_lines' existing `source_table`/`source_reference_id` linkage (stamped at apply-time), new `/settlement-deductions/:id/{hold,resume}` routes target the real table, modal now PATCHes `deduction.source_deduction_id`. Migration 202612550000. See `docs/audit/GUARD-WORKORDERS.md`. Removed from this queue.
`GUARD-MANUAL-JE-HUB-NO-MUTATION-PROOF` — **FIXED (ACCT-F5310, CC-1, 2026-08-15, PR #7282)** — refactored `verify-manual-je-hub-create.mjs` to `checkAll(readFile)`/`--selftest` with ten named independent mutations (hub button text/wording/role-gate/modal-import x2, topbar navigate, list `?create=1` read, list URL-sync, service+routes threshold-reintroduction x2), zero behavior change to the live path. See `docs/audit/GUARD-WORKORDERS.md`. Removed from this queue.
`REPORTS-GL-JE-SETTLEMENT-SELFTEST-DRIFT` — **FIXED (CC-1, 2026-08-15, PR #7284)** — `verify-reports-gl-je-final-leaves.mjs`'s selftest anchored on removed `"vendor",` text; re-anchored to `"settlement"` (the leaf's current last Required-array element). See `docs/audit/GUARD-WORKORDERS.md`. Removed from this queue.
`BILL-EXPENSE-CATEGORY-PICKER-RAW-UUID-FALLBACK` + `AUTO-DEDUCTION-POLICY-HISTORY-NO-HUMAN-LABEL` + `RECORD-EXPENSE-SUGGESTED-LOAD-RAW-UUID-LABEL` — **FIXED (ACCT-F5311, CC-1, 2026-08-15, PR #7287)** — batched: bill-mode category picker + auto-deduction policy history + expense suggested-load (both auto-suggest AND manual-override paths, the second found live-reading the file) all replaced with `entityLabel`; no FK/posting change. See `docs/audit/GUARD-WORKORDERS.md`. Removed from this queue.

Codex owns no implementation in these protected money paths. Each item remains OPEN until its product PR and exact guard are merged.

## ☑ MY OWN 76-ITEM ORPHAN-GUARD SLICE — 76/76 GREEN + WIRED (closed 2026-08-15)

`docs/audit/ORPHAN-GUARD-OWNER-HANDOFF-2026-08-15.md` itemizes 76 money/accounting/banking/factoring/settlements
guards. Ran all 76 live: 71 passed as pure registry hygiene, 5 were genuinely RED — all 5 root-caused and fixed
(see `docs/audit/GUARD-WORKORDERS.md` ACCT-F5305/F5306/F5307/F5308 for full detail): stale numeric ceiling
(`verify-accounting-required-linkage-honest.mjs`), stale MUST_KEEP contradicting an already-shipped
honesty_audit drop (`verify-factoring-required-liability-honest.mjs`), a genuine missing Required restore
for real Built surfaces (`verify-fleet-gl-je-required-honest.mjs`), a stale text-match anchor after a
legitimate prop rename (`verify-wave-c-invoice-bank-batch5.mjs`), and the already-tracked
`LIABILITY-PRE-SETTLEMENT-DROP-GUARD-DRIFT` (`verify-maint-bill-factoring-liab-built.mjs`) — all merged in
PR #7227. **Batch-wired all 76 into CI 2026-08-15**: `scripts/verify-cc1-money-orphan-guard-registry-batch.mjs`
+ claimed verify-step 3429 (PR #7252 claim-reserve, PR #7256 author), mirroring Cursor's shipped 3422 pattern
exactly. `verify-guard-wired` orphan census dropped from 77 → 1 repo-wide (the single remainder is
`verify-wave-c-gl-je-system-qbo-recon.mjs`, explicitly excluded from USMCA sprint scope by owner ruling —
left deliberately unwired). Slice closed; no remaining work.

## ☑ CODEX-ZERO-REMAINDER-PROTECTED-MONEY-20 — CLOSED (verified live 2026-08-15)

`CODEX-ZERO-REMAINDER-PROTECTED-MONEY-20` — re-ran `verify-codex-vertical-nonmoney-zero-remainder.mjs`
live: PROTECTED had already shrunk to a single remaining key (19 of the 20 closed by ACCT-F5209 in an
earlier turn, per the guard's own comment). The last one, `reverse_link accounting:escrow`, closed
ACCT-F5313 (PR #7574) — `protected gaps visible=0` live. Slice closed; no remaining work.

## LAW LOCK
Canonical launch definition: Fully-Wired 1–11 honest + Live last — `HONEST-BUILT-LAUNCH-LAW-2026-08-14` + `FULLY-WIRED-COMPLETE-BAR-2026-08-13`. Live Chrome (item 12) is Cursor-led with Codex assisting per owner directive 2026-08-15 — CC-1 stays on Built-honest (items 1–11); do not get pulled into item-12 clicking.

## ☐ CODEX LIVE HANDOFF · OWNER-GATED=no

`LV-REPORTS-CUSTOM-SCHEDULER-CANONICAL-SOR-UNMOUNTED` — **FIXED CLOSEOUT (stale row, CC-1, 2026-08-16)** — already fixed by #7442 (an earlier session); re-verified live, board row never closed. See `docs/audit/GUARD-WORKORDERS.md`. Removed from this queue.

`LV-REPORTS-SCHEDULED-SUBSCRIPTIONS-STALE-CPA-AND-DUPLICATE-RECIPIENTS` — **FIXED (ACCT-F5315, CC-1, 2026-08-15, PR #7580)** — migration applied to prod. See `docs/audit/GUARD-WORKORDERS.md`. Removed from this queue.

`CLS-OPERATOR-COPY-VISIBLE-SCHEMA-NAMES-MONEY` — **FIXED (ACCT-F5312, CC-1, 2026-08-15, PR #7567)** — see `docs/audit/GUARD-WORKORDERS.md`. Removed from this queue.

`LV-FINANCE-PLANNING-PLACEHOLDER-ROUTES` — **FIXED (ACCT-F5316, CC-1, 2026-08-15, PR #7585)** — migration applied to prod. See `docs/audit/GUARD-WORKORDERS.md`. Removed from this queue.

`LV-COA-AND-ITEMS-UNAUDITED` — **FIXED (ACCT-F5317, CC-1, 2026-08-16, PR #7636)** — audit trigger attached to `catalogs.accounts/items/payment_terms/classes`, migration 202612610000 applied + idempotency-proved on prod. See `docs/audit/GUARD-WORKORDERS.md`. Removed from this queue.

**CLOSED (CC-1, 2026-08-16):** 3 stale open PRs found on `@me` (#7542, #7534, #6020) all merged/superseded per explicit owner directive; 2 pending claim-only PRs (#7627, #7632) also merged. All confirmed live on `origin/main`. See `docs/audit/GUARD-WORKORDERS.md` for detail.

## CODEX LIVE HANDOFF · 2026-08-16

`CLS-OPERATOR-COPY-VISIBLE-SCHEMA-NAMES-MONEY-REGRESSION` — **FIXED (ACCT-F5318, CC-1, 2026-08-16, PR #7682)** — all 7 findings (8 physical occurrences, including an 8th `banking.bank_transactions` instance the handoff's line numbers didn't list) reworded to plain operator language; baseline fully shrunk. See `docs/audit/GUARD-WORKORDERS.md`. Removed from this queue.

## CODEX CI HANDOFF · 2026-08-16 · P0

`CI-POST-BANK-F5330-MAIN-RED` — current `origin/main` independently fails: `node scripts/verify-schema-parity.mjs` (`journal_entry_postings.entity_type` absent baseline), `node scripts/verify-no-duplicate-financial-ledger.mjs` (`vendor_payment_methods` missing canonical declaration), and `cd apps/frontend && npx tsc -b` (Manual JE `entity_type` widened to `string`). Exact files, dependency #7769, acceptance, and `BLOCKS=MAIN-CI-GREEN` are in `docs/audit/GUARD-WORKORDERS.md`. OWNER-GATED=no.

`LV-FINANCE-AMORTIZATION-CREATE-UNGATED-RAW-DATE` — Live USMCA enables blank stored-loan creation; `AmortizationPage.tsx` coerces blank numeric fields to zero and emits a raw date through its dynamic helper, evading `verify-no-raw-date-input`. Exact acceptance and `BLOCKS=LIVE-FINANCE-AMORTIZATION-CREATE` are in `docs/audit/GUARD-WORKORDERS.md`. No create was attempted. OWNER-GATED=no.
## CODEX HANDOFF · 2026-08-16 · LV-SETTLEMENTS-TOOLBAR-LEAVES-POINT-ALIAS

Live USMCA `/settlements` immediately redirects to canonical `/driver-finance/settlements`, where Search/Range/gear render. Update only those three connectivity leaves and add Settlements to both vertical `EXACT_CONSUMERS` guard maps with alias mutations. Filter remains qbo_chrome-only; settlement economics/data/routes unchanged. Exact OPEN row, audit 878, and acceptance are filed. OWNER-GATED=no.
