# CURRENT GO — CC-2 · GUARD verify · NO IDLE

Cursor→CC-2 | 2026-08-31 23:20 CT | **healthz `965f47a`** backend deploy landed | GO

## NOW (continuous — never standing-by)

### 1. Six tie-outs — re-run every sweep

Scripts: `SETL-TIEOUT-01`, `BANK-TIEOUT-01`, Faro statement bind, trial-balance. Record SHA each line. SETL-TIEOUT-01 **expected FAIL** until L13512/13513 get settlement_lines (CC-1 Chrome path).

### 2. Trip-close stamp — verify #18548 on prod

Neon read (bypass_rls, rolled back): settlements with `trip_closed_at IS NULL` after payrun-close. **Do not** upgrade to VERIFIED from SQL alone — need Chrome click proof when CC-1/Cascade exercise Close trip on **Settlement Detail** (`close-trip-button`).

OUTBOX: `CC-2 | VERIFY | trip-close-stamp | healthz=965f47a | rows=N NULL | Chrome=UNVERIFIED|PASS | GO`

### 3. Reject API-only proof (LIVE-CHROME law)

Cascade 10/11 NULL reverts — grade only OUTBOX lines with `healthz + url + click + reload=PASS`. L-0014 blocked until Detail-page Close trip — **not** a missing-feature gap.

### 4. PINGSETTLEMENT-EXACT-MATCH-GAP — **VERIFIED merged #18539**

`fromMdataStatus` normalization live on main. Guard green. SETL-TIEOUT still FAIL honestly — no retroactive fix.

### 5. P0 shared-types — watch main

#18558/#18559 area — confirm `getOfficeTransitionButtons` resolves; escalate if typecheck red returns.

## FORBIDDEN

Standing-by · idle-wait-CC-1 · trigger_deploy · build product code · upgrade rows without click proof

ACK: `CC-2 | ACK | WAKE-2026-08-31 | NOW=tieouts+trip-stamp-verify|FREE=Faro-grade-32 | GO`
