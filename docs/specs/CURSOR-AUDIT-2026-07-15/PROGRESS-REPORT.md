# IH35-TMS — Continuous Build Progress
**As of:** 2026-07-16 · law of the land: trust > speed; verify; Tier-1 HOLD; integrity-first

| Status | Count |
|--------|------:|
| Merged this wave | #2535–#2547 (incl. #2547 OB map via mdata) |
| Live SHA | **`4dd0c59`** (#2547 OB map — no JE) |
| Open | **HOLD:** assemble balanced preview JE from mapped OB (no post) |
| Ops blockers | Relay TRANSP missing key; TRANSP missing OB flag override |

## Integrity order (GUARD)
425C ✅ → fuel/Relay bridge ✅ → QBO collapse Step-2 ✅ → OB live pull/parse ✅ → OB map (#2547) ✅ → **OB JE preview assemble (this HOLD)** → settlement STEP 3 → fine→deduction → claim graph → **THEN UX**

## MERGED (recent)
- **#2538** Relay → `fuel.fuel_transactions` bridge (no GL)
- **#2539** QBO Step-2 `mdata.qbo_*`
- **#2543** `parseBalanceSheet` (exact cents)
- **#2545** Live OB BS/TB preview as_of 2026-03-31 — flag OFF by default; no JE
- **#2546** Progress docs after #2545
- **#2547** Map OB live preview via `mdata.qbo_accounts` (no JE) — live `4dd0c59`

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
→ now includes `account_mapping` + `je_assemble` (preview only; never posts).

## NEXT
1. Owner: Render `RELAY_API_KEY_TRANSP` + restart + backfill → Neon COUNT > 0
2. Owner: enable OB flag for TRANSP; label this HOLD PR `JORGE-APPROVED`
3. Later HOLD: owner posts opening JE by hand / approved path (still no agent `createJournalEntry`)
4. Settlement STEP 3: kill dead RETIRE payroll writers + G4 → 0 (no money flags)
5. UX last — tab-count HOLD

## Architecture cites (JE assemble)
- OBE plug: `docs/specs/OPENING-BALANCE-IMPORT-AND-CUTOVER-2026-07-16.md` §3
- OBE→RE later reclass (not this JE): `docs/specs/ACCOUNTING-ARCHITECTURE.md` §4
- No inventing GL accounts — plug only if OBE is in `account_mapping.mapped`

Agent never posts OB JE alone. No TMS→QBO write-back. No overwrite of `transp-2024-12-31-*`.
