# APP DEFECT REGISTER — eight roots (owner 2026-08-29)

Canonical owner walkthrough: `~/Downloads/00-MASTER-APP-DEFECT-REGISTER-2026-08-29.txt`  
**U14 14/14 CERTIFIED — never recertify. Skip #15546. PAY-01 BLOCKED on owner A/B.**

| Block | Seat | Now |
|---|---|---|
| DOC-01 | CC-1 schema + Cursor UI | after T-07 safety bind batches |
| DQF-01 | CC-1 schema + Cursor wizard | after T-07 |
| UI-01 | Cursor | layout law + ratchet (this wave: HoverDropdownNav overflow) |
| RT-01 | Cursor | one pairing engine; TR via `trip_type` already on main (`roundTripsLegs.ts`) — remaining: unify Trip Pairing Board |
| DISP-01 | Codex | detention load-status, at-risk set, KPI double-count |
| DISP-02 | Codex logic + Cursor grid | planner dead filter; Aug-21 format |
| CUST-01 | CC-3 | two customer surfaces; `master_data`→`mdata` is owner/canonical |
| WIRE-01 | Cursor | Export PDF origin (this wave); then emanifest + e-sign reuse |
| PAY-01 | CC-1 after owner | **BLOCKED** — do not add plaintext account/routing |

RT-01 stale line in the register (“RoundTrips never reads trip_type”) is **closed in code** as of #17848 / `resolvedTripType`. Live Chrome still owed on current healthz after deploy.

Recipe B: only CC-2 writes `prod_verified`.
