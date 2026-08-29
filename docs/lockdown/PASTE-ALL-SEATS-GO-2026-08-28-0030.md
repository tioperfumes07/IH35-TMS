# GO-0030 — Lists + Accounting TEST + Dispatch Book TEST + Vendors/Customers create

`git pull --ff-only origin main`
Queue index: `docs/lockdown/GO-QUEUE-0030-0054-INDEX.md`
THIS packet: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-28-0030.md`
**RIDER (mandatory):** `docs/lockdown/GO-0030-RIDER-COLLISION-CLOSES-GUARD-2026-08-29.md`
**Standing orders (underneath):** `docs/lockdown/STANDING-ORDERS-CC-1-CC-2-CC-3-2026-08-29.md`

**NOW = this GO.** After FAST-MERGE/ACK, immediately start **GO-0031** without waiting for Jorge or Cursor chat. Idle=defect.

USMCA only. Chrome + labeled TEST DATA create. Unique FINDING = 500/dead/silent. KEEP TEST. U14 never restamp. PROG-01 SKIP. CC-1 money does **not** gate other seats. Nobody except Cursor `trigger_deploy`. Skip #15546 #16895.

**Chrome-only seats** (`cc-3/`, `codex/`, `cascade/`, `devin/`, `devin-a/`): author **no** verify-steps and **no** migrations. Chrome + TEST need neither.

ACK: `SEAT | ACK | GO-0030+RIDER | NOW=<one line> | SHA=<healthz> | GO`

## Per coder (do this, this GO)

### CC-1 (9223)
`/accounting` CREATE labeled TEST expense (header+lines) → canonical. Then leftover unique money. Do not gate others. No 9877 remake. PROG-01 SKIP.
`CLOSES: none — TEST expense hop; stamp ACCT-SURF-02 only after GUARD live prove`

### CC-2 (9224) — GUARD
`/reports` unique leftover (500/dead/silent). New class. Calendars pick-a-day. **Also run GUARD:** live-prove oldest unproven PASS you can reach; only you flip `prod_verified`.
`CLOSES: none — GUARD live-prove; flip prod_verified only after live click+Neon`

### CC-3 (9225)
`/lists` every catalog card → correct list → `+ Create` = picker wizard. Nested `+ Add new` first row. TEST create one catalog row. No verify-steps / migrations.
`CLOSES: none — Lists chrome+TEST; lists items need GUARD after PASS`

### Codex (9226)
`/dispatch` Book labeled TEST load → persist → reload. Do not remake DSP-MONEY-F7175. No verify-steps / migrations.
`CLOSES: none — Book TEST load; dispatch items need GUARD after PASS`

### Cascade
Live walk `/lists` then `/accounting`. Unique FINDING only. No product PR. No U14 restamp. No verify-steps / migrations.
`CLOSES: none — unique FINDING only; no prod_verified flip`

### Devin
`/vendors` USMCA. `+ Create` TEST vendor → `mdata.vendors`. VEND-S01=123. No body PATCH. No verify-steps / migrations.
`CLOSES: none — TEST vendor create; vendors items need GUARD after PASS`

### Devin-A
`/customers` `+ Create` TEST customer → `mdata.customers`. Nested add = Lists chrome. No verify-steps / migrations.
`CLOSES: none — TEST customer create`

### Cursor (9222)
Lead. FAST-MERGE. Chrome janitor on `/lists` if CC-3 jammed. Deploy 5–10 only.
`CLOSES: none — lead/deploy/janitor`

## Forbidden
HOLD. Waiting for a new GO. Waiting for CC-1. PROG-01. U14 restamp. TRANSP/TRK/QBO write-back. Dual Devin.
