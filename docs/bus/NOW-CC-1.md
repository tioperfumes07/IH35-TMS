# R-165 DONE + GUARDS FLIPPED BLOCKING — CC-1 — 2026-09-25 1:25 PM CT (18:25Z)
Prior content archived: `docs/bus/archive/NOW-CC-1-2026-09-25-{21,22}.md` (WORM). R-165 delivered 18:05Z,
well before the 20:00Z deadline (PR #22686 sha `6328b2a68d`, bus status PR #22688 sha `e7c21dd339`).

`CC-1 | R-165 DONE | 6328b2a68d33b6c5e72d9206dac750e0fe7dc189 | selftest red→green below | NEXT: R-159 blocked (below), flagged LINK-3 to Lead`

## What changed (1 PR, code only, no prod writes)
1. `resolveExpenseItem()` — resolves item by live `catalogs.items.item_name`; sets
   `expense_lines.expense_account_uuid`+`item_id`; refuses on no item/no account.
2. `dedupeCompanyExpenses()` (pure) — drops reimbursement-echo lines when a genuine sibling exists
   at the same (load,amount); a reimbursement-only line survives, booked to the reimb item.
3. `seedExpense` skips a regular expense when a card-fuel expense already covers the same load+amount.
4/5. Guards `verify-expense-line-account-matches-item.mjs` / `verify-no-fuel-purchase-booked-twice.mjs`,
   both with planted-red selftests, wired into `money-pr-local-gate.mjs` LIVE_DOMAIN_GUARDS.

## Guards flipped `blocking:true` 1:25 PM CT (18:25Z)
R-164 (AUTH-021+022+023) CONSUMED 1:09 PM CT (18:09Z) — live-reconfirmed before flipping: Guard A 0
itemized lines yet (vacuous PASS); Guard B 0 duplicate groups now (was 37 pre-R-164) — real PASS.
Both `*.gate.json` updated, selftests re-run clean.

## R-159 BLOCKED
AUTH-014 expired (17:46Z). Reconfirmed all 21 Faro advances unchanged, ready to re-run — no
DATABASE_URL in this env to execute (never printing/guessing it, never hand-writing a JE outside
the engine's own path). Stopped rather than invent a workaround; resuming once DB access exists.

## FLAG for Lead (not mine, no standing) — CC-2 found live: verify-load-to-cash-chain LINK 3 fails,
313/507 USMCA expense_number mismatches (was 385/385, owner law: must start with load_number). My
check: total=507 matches USMCA exactly (rules out a cross-entity leak). Could not confirm the 313
itself (mdata.loads RLS-blocks my read-only session, no DATABASE_URL to bypass). Two candidates,
neither mine: (a) LINK 3's own SQL has no operating_company_id filter unlike LINK 1/2 (same class
fixed there 09-13, not here); (b) R-164/AUTH-022 new-expense creation may mint EXP-YYYY-NNNNN
(nextExpenseDisplayId, unchanged by R-165) not load-prefixed. Not R-165 (zero prod writes). Routing.

CC-1 | 1:25 PM CT (18:25Z) | R-165 + guard flip done. R-159 blocked on DB access. LINK-3 flagged.
