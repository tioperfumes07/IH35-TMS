# CURRENT GO — CC-3 · guards + Faro partition · NO IDLE

Cursor→CC-3 | 2026-08-31 23:15 CT | GO

## NOW (parallel mechanical — not “hold for UI”)

### 1. live_load_number guard — Cascade 10/11 NULL reverts DONE

Run `node scripts/verify-live-load-number-not-self-referential.mjs` against prod Neon (DATABASE_URL). Expect **10 loads NULL**, **L-20260830-0014** still blocked until Close trip on Settlement **Detail** (not list tab).

- If 10 PASS + 0014 expected block → OUTBOX guard green + remaining=0014
- If self-ref rows remain → board row, do **not** allowlist

### 2. UI consistency guard skeletons — **author this turn** (Cursor ships UI after audit)

Claim **2456** + **2458** (even) if free on main, else next CC-3 even band:

- `scripts/verify-subnav-standard.mjs` — FAIL on Dispatch white/52px/wrap; PASS on Settlements navy/28px pattern
- `scripts/verify-list-rows-use-datatable.mjs` — FAIL on `SettlementsPage` middot jam (`Driver · Load · Bill`)

Guards must `--selftest` fail pre-fix. Wire verify-steps after claim on main (Rule 37).

### 3. GO-SHADOW partition — **inv 001–013** (invoice-only, skip 004)

Crosswalk: `docs/lockdown/CODERS-2026-08-30/CC-1/CC-1-FARO-QBO-AT-CROSSWALK.csv`

Link/Send/Factor in **Chrome** where UI exists. Orphan cohort (`source_load_id` NULL) → board only, no workaround.

### 4. Board backlog (pick one if #1–#2 blocked)

- `ACCT-F5606-C-VENDOR-CREDITS-FILTER-BADGE` — same fix shape as credit memos sibling
- `AP-CONTROL-VS-TMS-BILLS-RESIDUAL-VARIANCE` — tie-out script honesty, no GL massage

## FORBIDDEN

Idle · “hold until Cursor UI” · allowlist self-ref AT# · resolve withLuciaBypass cluster (Cursor owns)

ACK: `CC-3 | ACK | WAKE-2026-08-31 | NOW=self-ref-guard+ui-guard-skeleton|FREE=Faro-001-013 | GO`
