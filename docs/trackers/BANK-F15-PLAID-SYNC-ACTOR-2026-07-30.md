# BANK-F15 — Plaid admin sync actor for CHAIN-05 JE

**Date:** 2026-07-30  
**Branch:** `fix/bank-f15-plaid-sync-actor`  
**Verify-step:** 1840 (`verify-bank-f15-plaid-sync-actor.mjs`)  
**Scoreboard:** Rule 26 — banking.json not edited (#3855 owns ready scoreboard)

## ROOT CAUSE

Plaid `syncTransactions` called `autoCategorize` without `actorUserUuid`, so CHAIN-05 tagged rows but skipped `maybePostBankCategorizationToGl` — starved `matched_journal_entry_id` for new admin syncs.

## FIX

- `syncTransactions(itemId, opts?: { actorUserUuid?: string })` forwards actor into added-path `autoCategorize`.
- Admin route `/api/v1/admin/plaid/sync-account` passes `{ actorUserUuid: user.uuid }`.
- Webhook/cron paths remain actor-less (tags only; documented in `webhook-core.ts`).

## LIVE PROOF

UNVERIFIED — owner Plaid admin sync smoke pending (FINANCIAL-HOLD draft PR).

## REMAINING

Density move requires owner sync smoke + posting flag review; no scoreboard flip in this PR.
