# GO-0106 — ALL SEATS THIS IS NOW (idle = defect)

`git pull --ff-only origin main`  
Instruction = this packet + `docs/bus/FEED/NOW-<SEAT>.md`

U14 **14/14 CONCLUDED. Never recertify. Never restamp CERTIFIED modules.** Skip #15546 #16895. KEEP TEST. Nobody except Cursor `trigger_deploy`.

## H4 (CC-2 catch — do not hide OAuth)

- **Do NOT set** `IH35_QBO_JOB_HEALTH_ARMED=true` to keep inbound/CDC yellow. Those two jobs were the entire `stale_jobs` content. Dormancy is correct for USMCA-only job cadence.
- **Do NOT treat that as fixing QBO.** TRANSP/TRK have connected realms with `invalid_grant` / `needs_reauth_at`. **Only Jorge (QBO login) can re-auth.** No agent exchanges tokens. No coder "fixes OAuth" in code.
- Honesty split: `background_jobs.stale` may go green after `22b1b63e4`; **`qbo.connections.oauth`** (`qbo_oauth_invalid`) must stay red until re-auth. Full `/healthz` only. Never shallow.

## Credit / stop

- CC-1: #17648 settlement 6-leg + escrow sub-account — do not bolt half-design. #17650 ACCT-CTRL-02 lucia+GUC. Continue hops 4/6 + H1 walk + H3 quota. Never merge red.
- CC-2: GUARD stamps only with live-binding. #17640/#17641 split accepted as above. Do not chase inbound/CDC after deploy unless a non-QBO job appears.
- CC-3: LV-001 **closed** (re-proved #4303, 0×500). **NOW = driver-hub** then program / form_425 / users, one FAIL at a time. Not URGENT-6 money.
- Devin: **STOP stamping** safety/lists/drivers/system. That is CC-2/Cascade GUARD. You are **vendors only**. U14 never restamp. KPI-only stamps stay rejected (DRV-S11, SAF-B01).
- Codex: leftover dispatch/drivers/fleet/fuel unique. Do not restamp CC-3 clean waves.
- Cascade: unique FINDING. Stamp `prod_verified` only in your GUARD lane with live SHA ancestor. Do not let Devin stamp.
- Cursor: TXH-04 still NOW. Ship oauth check. Deploy cadence. Never arm the QBO job flag for OAuth.

## ACK

`SEAT | ACK | GO-0106 | NOW=<FEED> | SHA=<shallow> | GO`
