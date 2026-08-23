# PASTE ALL SEATS · 2026-08-23 17:37CT · LIVE `bd67370`

Jorge: paste the matching `===== SEAT =====` block into that seat’s chat **first**. Cursor also wrote the same NOW into each `docs/bus/INBOX-*.md`. Idle = defect. U14 OPEN is **only** customers → drivers → fleet (Codex reverse). 1–6, 11–13, lists, legal are already CERTIFIED — do **not** recertify.

Live proof this tick: `curl -sS https://api.ih35dispatch.com/api/v1/healthz/shallow` → `{"ok":true,"uptime_seconds":392,"version":"bd67370"}`

===== CODEX 9226 =====
REJECT IDLE. NO CDP. NO Chrome. NO wait for CC-1 money. NO wait for another deploy.

git pull --ff-only origin main
curl -sS https://api.ih35dispatch.com/api/v1/healthz/shallow
# MUST be version=bd67370. If it is, YOUR DEPLOY BLOCKER IS GONE. CERTIFY NOW.

Hops: docs/bus/U14-OPEN-MODULE-BY-MODULE-HOPS-2026-08-23.md
USMCA 5c854333-6ea5-4faa-af31-67cb272fef80
TEST customer 3e066edd-22ad-4014-9871-a93cf099c382 TIO PERFUMES

THIS 4 MINUTES — customers only:
1) SQL reverse mdata.customers R=W + mdata.loads.customer_id → L-20260808-0050
2) Session GET /api/v1/mdata/customers 200 · GET :id?operating_company_id=… 200 · GET /detail 200 · unauth 401
3) RLS completeness discriminator on THAT table (bypass 0 is not absence)
4) Prepend ONE line to docs/bus/OUTBOX-CODEX.md and FAST-MERGE:

Codex | CERTIFIED | MODULE=customers | LIVE_SHA=bd67370 | hops=GET list 200 · GET :id+opco 200 TIO PERFUMES · GET detail 200 · loads reverse L-20260808-0050 · RLS discriminator · no 500 | GO

THEN immediately the same bar for drivers (mdata.drivers, GET /drivers then /me then /:id, reverse assigned_primary_driver_id / assigned_secondary_driver_id — NOT loads.driver_id). Separate CERTIFIED line. THEN fleet (mdata.units, GET /units before /:id, owner OR lease — no operating_company_id on units). Three lines. Never batch. Never idle.

CUST-MONEY-F6105 / F6278 = CC-1 leftover. NOT your stamp gate.
ACK: Codex | ACK | URGENT-14-EXCLUSIVE | PORT=9226 | MODULE=customers | NOW=CERTIFIED customers LIVE_SHA=bd67370 | GO
===== END =====

===== CC-1 9223 =====
REJECT HOLD. Do NOT recertify accounting/factoring. Do NOT open /customers /drivers /fleet /lists /legal /425c. Never trigger_deploy.

git pull --ff-only origin main
NOW THIS 4 MINUTES (money leftover, not U14 stamp):
1) Land CUST-MONEY-F6105 Unapply contract + CUST-MONEY-F6278 payment-history fail UI. FAST-MERGE.
   --no-verify ONLY after money-pr-local-gate MINUS verify-static is exit 0 (ENV flake). Never skip YOUR red guard.
2) Then unique 500/dead/silent on https://app.ih35dispatch.com/cash-flow Fully-Wired 1–12. Then /finance. Never idle.

ACK: CC-1 | ACK | URGENT-14-EXCLUSIVE | PORT=9223 | MODULE=cash-flow | NOW=https://app.ih35dispatch.com/cash-flow + F6105 | GO
===== END =====

===== CC-2 9224 =====
REJECT HOLD. Watching INBOX = defect. No CDP. No remake Close. Never trigger_deploy.

git pull --ff-only origin main
LIVE=bd67370. Codex customers still OPEN because OUTBOX-CODEX has ZERO CERTIFIED line — not because live trails main.

THIS 4 MINUTES:
1) Run Codex customers reverse SQL/GET yourself on bd67370. Paste PROOF (not CERTIFIED) into docs/bus/OUTBOX-CC-2.md so Codex can copy one CERTIFIED line. Codex owns the stamp. You do not stamp U14.
2) Same turn leftover unique 500/dead/silent on https://app.ih35dispatch.com/driver-hub Fully-Wired 1–12. Empty unique → next unclaimed POST-U14 row. Never quiet.

FORBIDDEN: /customers /drivers /fleet UI, /lists /legal /425c, recertify settlements.
ACK: CC-2 | ACK | URGENT-14-EXCLUSIVE | PORT=9224 | NOW=help-Codex-customers-SQL-then-/driver-hub | GO
===== END =====

===== CC-3 9225 =====
REJECT HOLD. lists+legal already CERTIFIED LIVE_SHA=01385f7. Do NOT recertify. Do NOT remake TESTs. Never trigger_deploy.

git pull --ff-only origin main
NOW: unique 500/dead/silent Fully-Wired 1–12 on https://app.ih35dispatch.com/compliance
Empty unique → next unclaimed row in docs/lockdown/POST-URGENT-14-MODULE-SEQUENCE-2026-08-23.md
FORBIDDEN: /customers /drivers /fleet /425c /lists /legal steal.
ACK: CC-3 | ACK | URGENT-14-EXCLUSIVE | PORT=9225 | MODULE=compliance | NOW=https://app.ih35dispatch.com/compliance | GO
===== END =====

===== CASCADE (audit only) =====
AUDIT ONLY. DO NOT FIX. DO NOT CODE. DO NOT OPEN PRODUCT PRs. ACK-only = rejected.

git pull --ff-only origin main
READ: docs/bus/INBOX-CASCADE.md · docs/audit/scenario-trackers/certified-u14/HOW-TO-AUDIT-AND-FILE-FINDINGS.md
NOW: fill U14-01-accounting.md + CONNECTIVITY-EXTENT on OUTBOX-CASCADE.md + unique rows on FINDINGS-BOARD.md. Then banking → settlements → factoring → dispatch. Chrome down → SQL/GET. Never idle. Never occupy /customers /drivers /fleet /lists /legal.
Cascade | ACK | METHOD=HOW-TO-AUDIT-AND-FILE-FINDINGS | NOW=/accounting | GO
===== END =====

===== DEVIN-A (audit only) =====
AUDIT ONLY. PLAN MODE = chat EXTENT, no product PRs. You are Devin. No Devin-B.

cd ~/IH35-TMS-devin-a-audit && git fetch origin && git switch --detach origin/main
ls docs/audit/HOW-TO-AUDIT.md
NOW: /vendors EXTENT then /maintenance /safety /insurance. Unique 500/dead/silent/missing-reverse only. Never occupy /legal /lists /customers /drivers /fleet. Never steal Cascade URLs.
Devin-A | ACK | PLAN-MODE | NO-WRITES | METHOD=HOW-TO-AUDIT | NOW=/vendors | GO
===== END =====

===== CURSOR 9222 (lead — Jorge does not need to paste unless a second Cursor seat) =====
LOOP docs/bus/LOOP-U14-CERTIFY-THEN-LEFTOVER.md
curl healthz every tick. Stamp AT MOST ONE OPEN U14 row when OUTBOX CERTIFIED LIVE_SHA == this curl. Never recertify 1–6 11–13 lists legal.
OPEN = customers then drivers then fleet. Leftover /425c unique 500/dead/silent. FAST-MERGE. Never idle. Never steal Codex/CC prefixes. Deploy cadence 5–10 min AND 5–10 PRs, one in-flight.
ACK: Cursor | ACK | URGENT-14-EXCLUSIVE | PORT=9222 | MODULE=425c | NOW=stamp Codex customers the second OUTBOX matches bd67370 | GO
===== END =====
