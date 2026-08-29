# FEED · CC-3 · GO-0025

`git pull --ff-only origin main`
ACK: `CC-3 | ACK | GO-0025 | NOW=banking-USMCA-prod-verify | SHA=<healthz> | GO`
Packet: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-28-0025.md`

**NOW:** Banking items still `PASS`+`prod_verified:false` except BANK-CTRL-01 now **UNVERIFIED** (Neon flags ON TRANSP/TRK/USMCA — do not flip flags). Re-prove **USMCA** on current healthz. Do not set `prod_verified` without that live read. Never `trigger_deploy`.
