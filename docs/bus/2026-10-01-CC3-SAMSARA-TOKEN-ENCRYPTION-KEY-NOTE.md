# SAMSARA_TOKEN_ENCRYPTION_KEY — the one note (Round 303 T-43)

T-26, T-30 and T-33 each ended on this same unset variable, each honestly reported as
`UNVERIFIED` rather than claimed. This is the single consolidated explanation; future reports
point here instead of repeating it.

## The variable

`SAMSARA_TOKEN_ENCRYPTION_KEY` — a 32-byte hex string. Decrypts `integrations.samsara_config`'s
`api_token_encrypted`/`webhook_secret_encrypted` columns (AES-256-GCM, `apps/backend/src/lib/
samsara-crypto.ts`). Falls back to `ENCRYPTION_KEY` (the general app-wide key) if the Samsara-
specific one is unset — either satisfies it.

## Where it is set

Render's deployed backend environment only. It is listed BY NAME in
`~/Desktop/09-28-2026-IH35-MASTER-KEYS-ENVS-SINGLE-SOURCE-OF-TRUTH.md` (both
`SAMSARA_TOKEN_ENCRYPTION_KEY` and `ENCRYPTION_KEY` appear there) -- but that file is an INDEX of
variable names that exist on Render, not the vault itself; no actual value for either is written
there, and this session's local worktrees have no `.env` carrying either one. No tool available
to this session can read an existing Render secret's value (`Render__update_environment_
variables` is write-only, by design). This is a local-dev-session credential gap, not a
production one.

## What breaks without it

`samsara-crypto.ts` has an explicit production fail-closed (`NODE_ENV==='production'` throws if
neither key is set) and a deterministic DEV FALLBACK otherwise (`console.warn`, a hash of a fixed
seed string). In every local worktree this session has run a Samsara-calling cron from
(`fault-poll.cron.ts` T-26, `harsh-events-poll.cron.ts` T-30), the fallback key does not match
the REAL key the stored ciphertext was encrypted under, so `decryptSamsaraSecret()` fails with
`Unsupported state or unable to authenticate data` — an AES-GCM auth-tag mismatch, which is the
correct, safe failure mode for a wrong key (not silent corruption). The call never reaches
Samsara's API; nothing is sent, nothing is written. In both cases the cron's own error policy
(never swallow a failed tick) correctly threw instead of continuing, and the target table
(`maintenance.samsara_fault_code_history`, `safety.harsh_events`) stayed at its pre-existing
baseline — proven, not assumed, for both.

The ALREADY-DEPLOYED Render backend is unaffected: it has been running `samsara-positions.
service.ts`'s own `decryptSamsaraSecret()` calls successfully every tick since at least
2026-08-21 (the live position/odometer data this whole session's work is built on proves the
real key is correctly set there). Only a LOCAL session lacks it.

## What the first real tick proves

Once either cron runs inside the real deployed environment (which already has the correct key),
`decryptSamsaraSecret()` succeeds, the real Samsara API call executes, and:
  - `fault-poll.cron.ts` (T-26): a real row count in `maintenance.samsara_fault_code_history`,
    and (per Round 301 T-33) a resolved alert with unit + driver-at-time + severity for each.
  - `harsh-events-poll.cron.ts` (T-30): a real row count in `safety.harsh_events` (currently 1
    row, a known fixture, `raw_samsara_id='TEST-TESTMTDQ4UCF'`) and `telematics.dashcam_clips`
    (currently 0).

Both crons are already wired into the deployed `index.ts` startup sequence at 03:00 America/
Chicago, same as every other Samsara-poll cron this session built. No further code is needed for
either to start producing real data — the first real tick is a clock event, not a build task.

— CC-3, 2026-10-01
