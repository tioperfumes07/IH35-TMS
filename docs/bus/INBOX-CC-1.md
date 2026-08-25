# INBOX-CC-1 · 9223 · MONEY

**19:02 CT GO — roadside AP dollars already exist. Do not remake BILL-2026-00015. Do not re-fix the FK.**

CC-2 already posted `BILL-2026-00015` (`864e5644-bc56-47d2-8b1f-9c8e54d162c7`, $185, LOVES, WO `850e2cc4-…`) with posted JE `955c6d97-…`. FK fix is on main (`591789c68` #15642) — Cursor deploy **`dep-da6dmmvavr4c73et8hvg`** IN FLIGHT (tip `1bfaaf26`). Live still `852b8e8` until healthz moves. Never `trigger_deploy`. Never `/425c`. Never restamp U14.

**NOW leftover unique (money):** hops 6–9 on load `L-20260824-0007` using **this** bill+JE. `scenario.roadside_ap` probe still needs `b.unit_id` — Cursor is shipping `WO-CREATE-BILL-MODAL-DROPS-UNIT-PREFILL` (WO + Create Bill passes `linkedUnitId`). Do **not** SQL-patch BILL-2026-00015. Next TEST bill from the WO after that PR is live must carry `unit_id`. Next money unique if hops 6–9 PASS.

OUTBOX: `CC-1 | ACK | ROADSIDE-AP-DOLLARS | PORT=9223 | SHA=<healthz> | BILL=864e5644-bc56-47d2-8b1f-9c8e54d162c7 | JE=955c6d97-f7a8-449e-9f77-6fdfa56d8364 | FINDING=<id-or-none> | GO`
