# IH35-TMS — Continuous Build Progress
**As of:** 2026-07-16 ~04:45Z · non-stop Cursor slice

| Status | Count |
|--------|------:|
| Merged this wave | 5 (#2535–#2538, #2540) |
| Open | 1 (#2539) |
| Live SHA | `c667723` (#2538 Relay bridge) |
| Ops blockers | TRANSP Relay flag + API key + backfill |

## MERGED
- **#2535** checksum overrides mig 48–51 (`d18695861`)
- **#2536** 425C petition_date SoR
- **#2537** dispatch/invoice deeplinks
- **#2538** Relay → `fuel.fuel_transactions` bridge (no GL) — **live `c667723`**
- **#2540** CURSOR-AUDIT docs pack

## OPEN
- **#2539** QBO Step-2 mdata repoint — `JORGE-APPROVED`; CI finishing → squash merge next

## NEON / RELAY (TRANSP `91e0bf0a-…`)
| Check | Result |
|-------|--------|
| `integrations.relay_fuel_transactions` | **0** (TRANSP/TRK/USMCA all 0) |
| `fuel.fuel_transactions` | **0** TRANSP |
| `RELAY_FUEL_INGEST_ENABLED` default | **false** |
| TRANSP override row | **NONE** → ingest skips until Owner enables |
| Env still required | `RELAY_API_KEY_TRANSP`, `RELAY_API_BASE`, Manual Restart |
| Backfill | `POST /api/integrations/relay/fuel/backfill` `{"months":24}` |

Checklist: `RELAY-TRANSP-LIVE-CHECKLIST.md` · helper: `OWNER-RELAY-TRANSP-PROOF.sh` · merge: `CONFIRM=1 bash OWNER-MERGE-REMAINING.sh`

## NEXT
1. Merge **#2539** when CI green (Smart Mode approval if prompted)
2. Owner: enable TRANSP Relay flag + set Render key + backfill → Neon count > 0
3. OB 03/31 live QBO pull (read-only) after Step-2
