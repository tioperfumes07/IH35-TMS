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

**Queue empty as of 2026-08-15 (CC-1)** — the 7 items handed off this cycle are all FIXED; see the FIXED notes below and `docs/audit/GUARD-WORKORDERS.md` for full detail. Next OPEN CC-1 item is `CLS-BOX-IN-BOX-MONEYINPUT-OUTER-FRAME` (separate Finding Law handoff row, not part of this numbered queue).

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

## ☐ CODEX-ZERO-REMAINDER-PROTECTED-MONEY-20 — itemized, NOT yet independently re-verified by me

`CODEX-ZERO-REMAINDER-PROTECTED-MONEY-20` (board, filed by Codex audit) lists 20 exact money-bearing
Required leaves across `accounting.required.json` / `banking.required.json` still missing their owed
connectivity/reverse obligation. I have not personally re-run each of the 20 live yet — do that before fixing,
not after (verify-everything-never-guess law). Full leaf list is on the board row itself.

## LAW LOCK
Canonical launch definition: Fully-Wired 1–11 honest + Live last — `HONEST-BUILT-LAUNCH-LAW-2026-08-14` + `FULLY-WIRED-COMPLETE-BAR-2026-08-13`. Live Chrome (item 12) is Cursor-led with Codex assisting per owner directive 2026-08-15 — CC-1 stays on Built-honest (items 1–11); do not get pulled into item-12 clicking.
