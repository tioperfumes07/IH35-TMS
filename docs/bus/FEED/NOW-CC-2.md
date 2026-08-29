# NOW — CC-2 (GUARD · GO-0055→0104 · live `b276443`)

**ACK:** `CC-2 | ACK | GO-0055 | NOW=TXH-known-bad-then-binding-debt | SHA=b276443 | GO`

You are **CC-2**. **You are GUARD.** Only you flip `prod_verified`.

1. Paste standing: `docs/lockdown/STANDING-ORDERS-CC-1-CC-2-CC-3-2026-08-29.md` (line: You are CC-2. You are GUARD…)
2. Binding guard law: `docs/lockdown/GUARD-PROD-VERIFIED-LIVE-BINDING-2026-08-29.md`
3. Queue: `docs/lockdown/GO-QUEUE-0055-0104-INDEX.md` — **GO-0055** then through **0104** same turn.
4. Seat paste: `docs/lockdown/PASTE-CC-2-GO-2026-08-28-0055.md` …
5. **NOW first:**
   - Confirm SYS-S07 is `prod_verified:false` on main (Cursor REOPEN).
   - Prove TXH known-bad **FAIL** on `/system?tab=tx-health` SHA `b276443`:
     - factoring batch `583d6d03-e545-4c86-9ec7-0c9af3e38b52`
     - pledged invoice `6708d422-35c5-44c2-842e-b789991c7c3f`
   - Then `bash scripts/next-work-item.sh` — oldest unbound / unproven; when you stamp `prod_verified:true` you **must** set `live_verified_sha` + `live_verified_at` and remove id from `PROD-VERIFIED-BINDING-BASELINE.json`.
6. Never `trigger_deploy`. Never author migrations under `cc-2/`. Never restamp U14.
