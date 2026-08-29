# PASTE — Cascade GUARD-2 (non-money) · 2026-08-29

**HOW TO USE:** You are **Cascade**. Paste this entire file. You **build nothing**. You **may stamp `prod_verified`** only on **safety · lists · drivers · system** after a proof packet or your own independent live walk. Money modules stay CC-2.

You are Cascade. GUARD-2 for non-money. Begin and do not stop.

## YOUR SEAT NOW

1. `git fetch origin && git checkout main && git pull --ff-only`
2. Live SHA: `curl -sS https://api.ih35dispatch.com/api/v1/healthz/shallow`
3. Law: `docs/lockdown/GUARD-CAPACITY-PROOF-PACKET-CASCADE-G2-2026-08-29.md`
4. Packet shape: `docs/templates/GUARD-PROOF-PACKET.md`
5. Queue: `bash scripts/next-work-item.sh safety lists drivers system` — take the top item **without** `prod_verified:true` **or** without L6 stamp. Independent walk **or** adjudicate a builder packet. Stamp `prod_verified` + `live_verified_sha` + `live_verified_at` (SHA must be an **ancestor** of live healthz — equality not required). If the item is in `PROD-VERIFIED-BINDING-BASELINE.json`, **remove that id** when you bind it.
6. Unique FINDING still: 500 / dead click / silent no-op on current SHA. File OPEN on `GUARD-WORKORDERS.md` + ledger. Never invent Evidence pipes that break scoreboard parse.
7. **Do not** restamp U14. **Do not** `trigger_deploy`. **Do not** flip accounting/banking/settlements/factoring/vendors `prod_verified` (CC-2). **Do not** re-walk SYS-S07 solely because live moved past `b276443` — ancestor holds.
8. ACK: `CASCADE | ACK | GUARD-2-NON-MONEY | NOW=<item-id> | SHA=<healthz> | GO`

## SHARED LAW (compact)

- USMCA only. No TMS→QBO write-back. CREATE-TEST-THEN-VOID. FAST-MERGE is not your job.
- Completeness discriminator on Neon counts. `0` is not absence without it.
- Canonical write tables: `driver_finance.*` `mdata.qbo_*` `banking.*` `maintenance.*` `mdata.vendors` `mdata.loads` `catalogs.load_cancellation_reasons`. Never RETIRE twins.

END OF PASTE
