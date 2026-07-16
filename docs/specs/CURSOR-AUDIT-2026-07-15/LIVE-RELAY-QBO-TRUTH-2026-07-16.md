# LIVE PROD TRUTH — Relay TRANSP + QBO balances — 2026-07-16 (updated)

**Neon:** project `tiny-field-89581227` · branch `br-fancy-credit-akjnd07a` (production)  
**Entity:** TRANSP `91e0bf0a-133f-4ce8-a734-2586cfa66d96` (IH 35 Transportation)

## Relay (TRANSPORTATION) — LIVE EVIDENCE

| Check | Result |
|-------|--------|
| `integrations.relay_fuel_transactions` | **0 rows** (all entities) |
| Flag `RELAY_FUEL_INGEST_ENABLED` default | OFF |
| Override TRANSP | **enabled=true** (2026-07-12) |
| Override USMCA | enabled=true |
| Override TRK | enabled=false |
| Audit `RELAY-FUEL-INGEST-1` for TRANSP | **0 events** |
| Audit for USMCA | **128** windows on 2026-07-15, all `pulled=0` / `upserted=0` (Feb→Apr windows) |
| Failure audits | **none** (backfill path previously logged-only — fixed in worktree) |

**Verdict (honest):**
1. **TRANSP never successfully ingested** — not even empty windows. Most likely `RELAY_API_KEY_TRANSP` missing/wrong on Render (entity-scoped; no global fallback). Cron/backfill would throw `relay_not_configured` before writing a success audit.
2. **USMCA API auth appears to work** but returns **0 transactions** across the Feb–Apr 2026 window → wrong Relay account key, staging base URL, or USMCA truly has no Relay volume.
3. Desktop CSVs: May official export (47 codes, 2026-05-09→14) is importer-compatible; Construction Blocks dashboard export is June-only (288 codes). **Neither covers Feb/Mar open date** — need a full Relay portal export from account open → today for TRANSP.
4. Bridge code (worktree) cannot fill empty staging. **CSV import under Transportation is the fastest verified path to prove IFTA/history without waiting on Render.**

### Owner actions (do now — I cannot set Render secrets from here)
1. Render → API service env: set `RELAY_API_BASE` to **prod** Relay fuel transactions URL (never staging).
2. Set `RELAY_API_KEY_TRANSP` = Transportation’s Relay API key (not USMCA’s).
3. Redeploy / restart so cron picks up env.
4. In app as Owner, company = **Transportation** → Fuel → **Upload CSV** (May file smoke test) OR **API backfill** (6 months).
5. Prove: Neon `relay_fuel_transactions` count > 0 for TRANSP **and** `fuel.fuel_transactions` after bridge deploys.

## QBO / Opening balances — LIVE

| Check | Result |
|-------|--------|
| TRANSP realm | `123145885549599` **active** |
| TRK realm | `1432746210` **active** (separate) |
| USMCA QBO | **not connected** (expected — TMS-authoritative) |
| TRANSP accounts | mdata **369** / accounting **365** / only-in-accounting **0** / only-in-mdata **4** |
| TRK accounts | both **917**, orphans **0** |
| USMCA accounts | both 365 counts but **0 qbo_id overlap** — mirrors are divergent by id (HOLD for PR-2 reconcile; do not archive) |
| Locked OB date | **03/31/2026** (cutover **04/01/2026**, ASC 470-60) — supersedes stale 06/30/07/01 draft |
| OB importer code | still **12/31/2024 static preview** — must become live `qboReport(BalanceSheet/TrialBalance)` as_of 03/31 — **after** Step-2 |

**QBO Step-2 (this worktree, build-and-HOLD):** writers/readers repointed to `mdata.qbo_*`; guard `verify-no-accounting-qbo-writes` green. Not production until merge + deploy + owner OK.

**Bring balances (professional path — no invented figures):**
1. Merge/deploy Step-2.
2. PR-2: fold only-in-accounting orphans (USMCA id mismatch needs GUARD SQL, not a blind INSERT).
3. Live pull QBO Balance Sheet / Trial Balance as_of **2026-03-31** for TRANSP (and TRK) via existing `qboReport()` → snapshot → **preview JE** → owner/CPA approve → post behind flag OFF until tie-out.

## Worktree progress (NOT prod until merge/deploy/verify)
- 425C petition hardcode removed
- URL connectivity fixes
- Relay→canonical fuel bridge (no GL)
- Relay CSV dashboard adapter + Fuel UI Upload CSV
- Backfill failure → durable audit event
- QBO Step-2 mdata repoint + CI guard
