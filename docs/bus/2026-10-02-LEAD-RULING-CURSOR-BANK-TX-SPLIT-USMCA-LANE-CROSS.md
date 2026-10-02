# LANE_CROSS — CURSOR — CLAIM 202615221200 USMCA BANK_TX_SPLIT OVERRIDES — 2026-10-02

2026-10-02 · Cursor Lead · authorizes LANE_CROSS for this filename

## Why

`db/migrations/` is default-owned by CC-1 in `verify-lane-ownership.mjs`, but owner migration
lane law assigns **Cursor HH 12–23 UTC**. CLAIM-RESERVE #24066 already reserved
`202615221200` for Cursor to author Rule 50 USMCA overrides for
`BANK_TX_SPLIT_ENABLED` + `BANK_TX_SPLIT_GL_POSTING_ENABLED` at HH 12–23.

Neon measured 2026-10-02T11:45Z (bypass_rls=lucia, USMCA): both flags exist,
company-wide overrides **null** — MatchDrawer resolve-diff (BANK-F91020) cannot
persist/commit/GL-post splits for USMCA until these overrides land.

## Authorized

Cursor may add and merge exactly:

- `db/migrations/202615221200_usmca_bank_tx_split_flags_on.sql`

USMCA only (`5c854333-6ea5-4faa-af31-67cb272fef80`). No QBO write-back. No other
migration numbers. No TRANSP/TRK overrides.

## How to cite

`LANE_CROSS=2026-10-02-LEAD-RULING-CURSOR-BANK-TX-SPLIT-USMCA-LANE-CROSS.md`

PR body must carry the same line.
