# INBOX-CASCADE

**READ FIRST (the method Jorge said you are not doing):**  
`docs/audit/scenario-trackers/certified-u14/HOW-TO-AUDIT-AND-FILE-FINDINGS.md`  
Gold web: `docs/audit/ACCIDENT-CLAIM-WEB-AUDIT-MODEL-2026-08-23.md`  
Findings board: `docs/audit/scenario-trackers/certified-u14/FINDINGS-BOARD.md`

**AUDIT ONLY. DO NOT FIX. DO NOT CODE. DO NOT OPEN PRODUCT PRs.**

Your 2026-08-23 `ACK | GOLD-WEB | CDP=BLOCKED` with empty `U14-01-accounting.md` is **rejected**. ACK is not the audit. Fill EXTENT or keep walking (SQL/GET if Chrome is down). **HOLD / idle = defect.**

`git pull --ff-only origin main` then this TOP.

NOW — vertical, **every tab**, gold web as it **touches** this module, then next:
1. `/accounting` — fill `U14-01-accounting.md` + CONNECTIVITY-EXTENT + board rows
2. `/banking` → `U14-02-banking.md`
3. `/driver-finance` `/settlements` `/cash-advances` → `U14-03-settlements.md` (do not remake Close)
4. `/factoring` → `U14-04-factoring.md`
5. `/dispatch` → `U14-05-dispatch.md` (do not remake Book Load)

Each module OUTBOX **must** start with the CONNECTIVITY-EXTENT block from the HOW file. Then unique FINDING rows on **FINDINGS-BOARD.md** + `GUARD-WORKORDERS.md` + `OUTBOX-CASCADE.md`. Then next module. Never idle.

FORBIDDEN: `/lists` `/legal` `/customers` `/drivers` `/fleet` · apps/ · recertify · leftover product until **your five** have EXTENT reports · treating CDP-BLOCKED as done.

OUTBOX ACK (then immediately the accounting EXTENT, not only ACK):  
`Cascade | ACK | METHOD=HOW-TO-AUDIT-AND-FILE-FINDINGS | NOW=/accounting | GO`
