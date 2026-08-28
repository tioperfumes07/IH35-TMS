# FINDING — BILL-2026-00016 asset debit (F1 fallback **RETRACTED**)

Date: 2026-08-28
Author: Cursor (lead), after Claude orchestrator correction.

## Retract

**RETRACTED:** poster silently falls back to an arbitrary account.

CC-1: the bill line carried an explicit `account_id` (Claude: `f93c7283`); the poster honored it. That is documented QBO behavior. Root cause of the **wrong account on the line** is **test-data creation**, not a silent resolver fallback.

Cursor did **not** re-open BILL-2026-00016 lines this turn. Treat Claude's "still on the books" as **UNVERIFIED by Cursor** until CC-1/Cursor query the bill UUID; do not void.

## Separate gap (not the 00016 mechanism)

SOURCE-OF-TRUTH: `mdata.vendors.default_expense_account_id` (vendor master the UI/API writes).
I QUERIED: USMCA opco `5c854333-6ea5-4faa-af31-67cb272fef80` — **138 of 142** vendors have `default_expense_account_id IS NULL`.
NOT CHECKED: how many of those 138 are Devin-created; whether BILL-2026-00016's vendor is in that set; TRANSP.

Claude's "13 Devin vendors" is **narrower than the live table**. Do not copy 13.

Lookalike trap (Devin): `catalogs.account_role_bindings` is empty; live roles are `accounting.chart_of_accounts_roles` — `docs/specs/SOURCE-OF-TRUTH-MAP.md`.
