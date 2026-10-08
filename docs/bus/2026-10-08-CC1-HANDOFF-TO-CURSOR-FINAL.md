# FINAL HANDOFF CC-1 → CURSOR (ROUND 441.24), 2026-10-08 — CC-1 is retired

Nothing of CC-1's is left on one machine. Every unmerged branch is pushed as a draft PR.

## Branches
| Branch | PR | State | Proven | Not proven |
|---|---|---|---|---|
| `cc-1/relay-f441-fuel-items-parsed-guard` | #25791 (draft) | unmerged | `scripts/verify-relay-fuel-items-parsed.mjs` selftest 5/5; live PASS on prod (fills' fuel_items all parsed into `integrations.relay_fuel_transaction_lines`, lines sum to `total_amount_paid_cents`) | not run through money-pr-local-gate; needs a lane note (scripts/verify-* is CC-1's; this file is the authority) |
| `cc-1/r44116-every-money-out-is-expense` | #25792 (draft) | **SUPERSEDED — close it** | — | contradicts CHAIN-05 (ROUND 441.18/441.19); kept only so no commit lives on one machine |

Every other CC-1 branch from this session is merged (F420–F437, F439, Phase 1/2 and their revert, the Relay F440/F435 fixes).

## Not CC-1's any more — Cursor's
- **Relay backfill** (weeks 34, 38, 09-27 → today) on the new Transportation key. Mechanism: `RELAY_FUEL_BACKFILL_ONCE="<new run_id>|USMCA|<months>"`
  on the backend env (merged #25773). Run 2 on the new key timed out on a ONE-day window (2026-08-01). Relay is slow on that
  account, the same failure as the frozen TRANSP pull. Next: look at the per-call budget (`RELAY_WINDOW_CALL_TIMEOUT_MS`) or ask
  Relay. Details: `docs/bus/2026-10-08-CC1-HANDOFF-TO-CURSOR-RELAY.md`.
  - **OWNER RULE (441.24):** Relay data is USMCA only from **2026-08-03** forward. Everything earlier on that key is
    TRANSPORTATION and is excluded — a date filter, no entity investigation.
- **RELAY-F441:** #25791 above. Follow-up: per-unit prices are stored in cents and lose the third decimal (4.889 → 489).
- **RELAY-F442** (the sender fee): Cursor's #25758.
- **The matching engine** (441.15 #4): not started. Extend `fuel/relay-fill-link.service.ts` and the `relay_fuel` kind in
  `accounting/bank-recon/match.service.ts`; recommend only; each recommendation cites unit + date + amount.

## Neon
CC-1 has no forks left. Deleted: br-shy-wildflower-akncgc1a, br-red-meadow-aknhkedd, br-twilight-night-akmnrs5o,
br-blue-firefly-akm9ds0b, br-quiet-leaf-ak0jx0ag.
