# INBOX-CC3

## CURRENT (2026-10-25 01:45 PM CT) — LEAD. FINAL-2 — WORK TO THE LAST ROW, NO PAUSES.

**Your whole job:** [lead/CC3-FINAL-2.md](lead/CC3-FINAL-2.md) + the 45 rows in [lead/CC3-PENDING-ROWS-FINAL-2.md](lead/CC3-PENDING-ROWS-FINAL-2.md).

1. FULLY BUILT, NEVER A SHELL: real API + real Neon data + working actions + multi-select combobox filters + EntityLinks + 100% design, same PR. No docs-only "row closed" PRs.
2. Fast 4-min merge: gate once, frontend+backend tsc, push once, squash-merge. Never --no-verify.
3. Coding only, no Chrome. Answer from repo/docs/LAW/register/journal; ASSUMED: in PR body.
4. Report "CC3 DONE" + PR list in OUTBOX-CC3.md.

Superseded: every earlier CURRENT block.

<!-- Historical body retained below for audit; CURRENT above is law. -->

# INBOX-CC-3 — Cursor Lead · rewritten 2026-10-13

READ THIS FILE AT THE START OF EVERY ROUND. The Lead writes here directly.

RULE: write every result to docs/bus/OUTBOX-CC-3.md. The Lead reads the bus from origin/main.

## MONEY / RELAY / SETTLEMENTS / DISPATCH MONEY — CLOSED (2026-10-13)

Owner order 2026-10-13: close everything from CC-1/2/3 related to banking, money, dispatch,
factoring, settlements. Cursor lead closed / gated the live residual money gaps in this lane:

| Residual | Status | Proof |
|---|---|---|
| fuel_event JE load_id NULL (208 postings / 56 events) | **CLOSED AS GATED** | `repointAllFuelReceipts` dry-run: candidates=56, planned=0, no_covering_load=56, refused=0. Rule 32 — never invent load FKs. Engine path shipped: `scripts/ops/2026-10-13-fuel-receipt-repoint-load-null.mts` |
| Relay fill link / 2170 bill-payment / posted_to_gl flag | **SUPERSEDED** | engines on main |
| Oct-6 MONEY-ENGINES box | **HISTORICAL** | do not reopen |

## NON-MONEY — STILL OPEN IF UNFINISHED

Legal contracts PDF + category + hub filing (ROUND 435-CC3) is **not** banking/money/factoring/
settlements. Keep working that only if still red on tip — it is outside this closeout.

## YOUR OPEN ORDERS (money/banking/dispatch/factoring/settlements)

**NONE.** Do not invent load FKs for the gated fuel cohort. When a covering load later exists,
run the fuel-receipt-repoint ops script through AUTH — never hand SQL.
