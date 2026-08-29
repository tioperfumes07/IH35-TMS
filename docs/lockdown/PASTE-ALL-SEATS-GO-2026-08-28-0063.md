# GO-0063 — Payments leftover + GUARD insurance + ELD walk

`git pull --ff-only origin main`
Queue index: `docs/lockdown/GO-QUEUE-0055-0104-INDEX.md`
THIS packet: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-28-0063.md`
**RIDER (still mandatory):** `docs/lockdown/GO-0030-RIDER-COLLISION-CLOSES-GUARD-2026-08-29.md`
**Standing orders (underneath):** `docs/lockdown/STANDING-ORDERS-CC-1-CC-2-CC-3-2026-08-29.md`

**NOW = this GO.** After FAST-MERGE/ACK, immediately start **GO-0064** without waiting for Jorge or Cursor chat. Idle=defect.

Live SHA target: `b276443` (hard-reload; confirm `healthz/shallow` `version`).

USMCA only. Chrome + labeled TEST DATA create. Unique FINDING = 500/dead/silent. KEEP TEST. U14 never restamp. PROG-01 SKIP. CC-1 money does **not** gate other seats. Nobody except Cursor `trigger_deploy`. Skip #15546 #16895.

**Chrome-only seats** (`cc-3/`, `codex/`, `cascade/`, `devin/`, `devin-a/`): author **no** verify-steps and **no** migrations.

ACK: `SEAT | ACK | GO-0063 | NOW=<one line> | SHA=<healthz> | GO`

## Per coder (do this, this GO)

### CC-1 (9223)
CC-1 payments leftover
`CLOSES: none — money hop; prod_verified only after CC-2 GUARD live prove`

### CC-2 (9224) — GUARD
CC-2 GUARD insurance
`CLOSES: none — GUARD live-prove; flip prod_verified only after live click+Neon on current SHA`

### CC-3 (9225)
CC-3 /eld unique leftover
`CLOSES: none — chrome+TEST; items need GUARD after PASS`

### Codex (9226)
Codex /fleet equipment
`CLOSES: none — chrome/fix; items need GUARD after PASS`

### Cascade
Cascade /insurance FINDING
`CLOSES: none — unique FINDING only; no prod_verified flip`

### Devin
Devin vendors
`CLOSES: none — vendors chrome+TEST; items need GUARD after PASS`

### Devin-A
Devin-A customers
`CLOSES: none — customers chrome+TEST`

### Cursor (9222)
Cursor lead
`CLOSES: none — lead/deploy/janitor`

## Forbidden
HOLD. Waiting for a new GO. Waiting for CC-1. PROG-01. U14 restamp. TRANSP/TRK/QBO write-back. Dual Devin. Flipping `prod_verified` unless you are CC-2.
