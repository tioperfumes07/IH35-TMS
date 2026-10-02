# LEAD RULING — CURSOR feed fuel GL retire (bank-match only), lane cross into CC-1 feed

2026-10-02 · Cursor Lead · authorizes LANE_CROSS for this filename

## Why

Owner order `docs/bus/00-OWNER-ORDER-2026-10-02-ALL-CODERS-BUILD-100-PERCENT-NO-HANDOFF.md` §4
CURSOR assigns Cursor the bank-match writer and explicitly:

> **Feed:** `feed/seed-settlement-document.service.ts:1183` posts fuel directly. That is your
> feed lane, and nobody seeds. Retire the direct post.

Fuel cards are bank accounts (`00-OWNER-RULING-2026-10-02-FUEL-CARDS-ARE-BANK-ACCOUNTS-BANKING-POSTS.md`).
GL posts only via `postFuelFillOnBankMatch` inside `acceptMatchWithResolveDifference`. The feed
file is mapped CC-1 in `docs/bus/LANES.md`, but the owner named Cursor as the seat that retires
the second writer. Standing EACH-SEAT-BUILDS-ITS-ENGINE-END-TO-END (2026-10-01) — no handoff.

## Scope (this PR only)

- `apps/backend/src/feed/seed-settlement-document.service.ts` — remove `postFuelExpenseFromEvent` /
  `createExpenseFromFuelTransaction` from `postGlForSeededDocument`; keep `fuel.fuel_transactions` insert
- `apps/backend/src/feed/seed-settlement-document.routes.ts` — comment only (phase-2 contract text)
- `scripts/verify-fuel-posts-only-on-bank-match.mjs` — drop feed allowlist; assert feed has no poster calls

No seed run. No live match. No new GL math. No Chrome.

## Cite

`LANE_CROSS=2026-10-02-LEAD-RULING-CURSOR-FEED-FUEL-BANK-MATCH-ONLY-LANE-CROSS.md`
