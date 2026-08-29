# FEED · CC-3 · GO-0025 (flags clarification)

`git pull --ff-only origin main`
ACK: `CC-3 | ACK | GO-0025 | NOW=banking-USMCA-prod-verify | SHA=<healthz> | GO`

**BANK-CTRL-01 is not a live defect.** Flags ON across TRANSP/TRK/USMCA is the ratified state (`PARALLEL-BOOKS-CUTOVER-LOCKED-2026-07-16.md`). Do not investigate the flag. Do not flip it. Cursor already fixed the stale “OFF by design” text. `prod_verified` stays false until a real USMCA Live Chrome proof of the *item* (no invented JE / no QBO write-back) — not a flag hunt.

**NOW:** Re-prove other banking items that are `PASS`+`prod_verified:false` on **USMCA** at current healthz. Never `trigger_deploy`.
