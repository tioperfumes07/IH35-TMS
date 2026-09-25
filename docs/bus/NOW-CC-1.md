# NOW-CC-1 — trimmed 2026-09-25 (size-cap trim #7, WORM). Full R-153.8 text + prior history:
`docs/bus/archive/NOW-CC-1-2026-09-25-7.md`.

# R-153.8 (Lead, 6:22 AM CT/11:22Z) — 3 decisions ANSWERED, all mine to execute:
D1 item 6: give each self-carried invoice its load (link or Book Load), no override. Deadline 15:00Z.
D2 item 11: YES, fill unit/driver/trailer from the expense's own load (single-valued only, never
overwrite). Audited run-once script, next AUTH. Deadline 16:00Z.
D3: void my 11 correction JEs + 5 duplicate escrow releases, re-close via settlement engine WITH
escrow. Start after CC-2 posts "AUTH-005 CONSUMED" at top of NOW-CC-2. Deadline 15:00Z.
STAMP FIX applied below: `TZ=America/Chicago date` at write time from here on. My 6:35/7:05 AM CT
lines in the archive above were actually before 11:20Z -- correction noted, not re-editing WORM text.

CC-1 | 2026-09-25 6:32 AM CT (11:32Z) | Starting D1 now, per Lead's order. Read all 5 PDFs +
cross-checked live DB: invoices "009"(FLS $525)/"055-13555"(2EMS $3,180) are ALREADY live, sent,
source_load_id set, unfactored (display_id 13513/13555) -- no write needed. "026"(IM Specialized) is
ALSO already live/sent/linked as display_id 13540, $3,120.00 total, but the $3,032.60 payment shown
on the signed PDF was never posted -- posting it now (AUTH-007). "010"(Supply Chain Mgmt $4,000) and
"074-13593"(Aligator $4,800): no rate confirmation, no settlement document anywhere in either
reconciliation package for either one -- and load 13593 itself, live 3 days ago per
08-CODER-BOXES-AND-LAW's own record (id 5c56a69b-..., status cancelled), no longer exists in
production at all (checked by id and by load_number, zero rows). Not booking from guesswork per
Lead's own step 4 allowance; full detail in PR body + AUTH-007. Continuing.

CC-1 | 2026-09-25 6:36 AM CT (11:36Z) | D1 DONE (partial, honestly reported -- not the full
$12,592.40 target). AUTH-007 issued-before-execution then CONSUMED same-PR-family with real proof.
Rehearsed on Neon (dry-run+real+idempotency all correct), then production: payment PMT-2026-00007
(9ac8b201-...66fc) $3,032.60 posted against invoice 13540 (="026") -- status sent->partial, open
now $87.40, matching the signed PDF to the cent. TB still balanced (1,397,905,662=1,397,905,662).
Self-carried AR now confirmed live: 13513($525.00)+13540($87.40)+13555($3,180.00)=$3,792.40 open,
all sent/unfactored, none in a Faro purchase day. The remaining $8,800.00 (010 $4,000 + 074-13593
$4,800) stays UNBOOKED -- no rate confirmation, no settlement document, and load 13593 itself
verified gone from production (was live+cancelled 3 days ago, now zero rows by id or load_number).
Flagging that disappearance as its own finding for the Lead, separate from D1's deadline. Moving to
D2 now.
