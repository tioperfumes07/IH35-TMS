# IH35-TMS — Continuous Build Progress
**As of:** 2026-07-16 · law of the land: trust > speed; verify; Tier-1 HOLD; integrity-first

| Status | Count |
|--------|------:|
| Merged this wave | #2535–#2546 (incl. #2545 live OB preview + progress docs) |
| Live SHA | **`3dccc53`** (#2545 OB live preview — no post) |
| Open | **#2547** HOLD: OB map via `mdata.qbo_accounts` (no JE) |
| Ops blockers | Relay TRANSP missing key; TRANSP missing OB flag override |

## Integrity order (GUARD)
425C ✅ → fuel/Relay bridge ✅ → QBO collapse Step-2 ✅ → OB live pull/parse ✅ → **OB map (#2547 HOLD)** → settlement STEP 3 → fine→deduction → claim graph → **THEN UX**

## MERGED (recent)
- **#2538** Relay → `fuel.fuel_transactions` bridge (no GL)
- **#2539** QBO Step-2 `mdata.qbo_*`
- **#2543** `parseBalanceSheet` (exact cents)
- **#2545** Live OB BS/TB preview as_of 2026-03-31 (**live `3dccc53`**) — flag OFF by default; no JE
- **#2546** Progress docs after #2545

## NEON / RELAY (TRANSP `91e0bf0a-…`)
| Check | Result |
|-------|--------|
| TRANSP Relay flag | **ON** |
| RELAY audits for TRANSP | **0** (diagnosis: missing `RELAY_API_KEY_TRANSP`) |
| `integrations.relay_fuel_transactions` | **0** |
| Env required | `RELAY_API_KEY_TRANSP`, `RELAY_API_BASE`, Manual Restart |
| Backfill | `POST /api/integrations/relay/fuel/backfill` `{"months":24}` |

## OB preview (Owner)
| Entity | `OPENING_BALANCE_IMPORT_ENABLED` override |
|--------|-------------------------------------------|
| USMCA | ON |
| TRK | ON |
| TRANSP | **missing — enable before preview** |

Endpoint (read-only):  
`GET /api/v1/accounting/opening-balance-import/qbo-live/2026-03-31/preview?operating_company_id=…`

## NEXT
1. Owner: Render `RELAY_API_KEY_TRANSP` + restart + backfill → Neon COUNT > 0
2. Owner: enable OB flag for TRANSP; label **#2547** `JORGE-APPROVED`
3. Later HOLD: assemble balanced preview JE (still no post)
4. Settlement STEP 3: kill dead RETIRE payroll writers + G4 → 0 (no money flags)
5. UX last — tab-count HOLD

Agent never posts OB JE alone. No TMS→QBO write-back. No overwrite of `transp-2024-12-31-*`.
