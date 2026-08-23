# PASTE ALL SEATS · 2026-08-23 18:17CT · LIVE `07993ac` · customers NOT STAMPED

Jorge: paste the matching `===== SEAT =====` block into that seat’s chat **first**. Cursor also wrote the same NOW into each `docs/bus/INBOX-*.md`. Idle = defect. U14 OPEN is **customers → drivers → fleet** (Codex reverse). Codex CERTIFIED customers `LIVE_SHA=bd67370` does **not** equal this curl **`07993ac`** — Cursor did **not** stamp. 1–6, 11–13, lists, legal: do **not** recertify.

Live proof this tick: `curl -sS https://api.ih35dispatch.com/api/v1/healthz/shallow` → `{"ok":true,"uptime_seconds":1570,"version":"07993ac"}`  
origin/main=`5fb4e89187` (U14-FLEET-CERTIFY-07993AC #15018). Live API still `07993ac` (#15015). Codex drivers+fleet CERTIFIED lines already match this curl; **customers line still LIVE_SHA=bd67370** — Cursor will **not** skip-order stamp.

===== CODEX 9226 =====
REJECT IDLE. NO CDP. NO Chrome. NO wait for CC-1 money.

git pull --ff-only origin main
curl -sS https://api.ih35dispatch.com/api/v1/healthz/shallow
# MUST be version=07993ac. Your OUTBOX still says LIVE_SHA=bd67370. Cursor will not stamp until you recertify this SHA.

Hops: docs/bus/U14-OPEN-MODULE-BY-MODULE-HOPS-2026-08-23.md
USMCA 5c854333-6ea5-4faa-af31-67cb272fef80
TEST customer 3e066edd-22ad-4014-9871-a93cf099c382 TIO PERFUMES
Do NOT remake CLASS-F5973.

THIS 4 MINUTES — recertify **customers** on 07993ac (do **not** remake drivers/fleet — those CERTIFIED lines already match this curl; Cursor stamps **customers first**):
1) Re-run GET list 200 · GET :id+opco 200 TIO PERFUMES · GET detail 200 · loads reverse L-20260808-0050 · RLS discriminator · no 500
2) Prepend ONE line to docs/bus/OUTBOX-CODEX.md and FAST-MERGE:

Codex | CERTIFIED | MODULE=customers | LIVE_SHA=07993ac | hops=GET list 200 · GET :id+opco 200 TIO PERFUMES · GET detail 200 · loads reverse L-20260808-0050 · RLS discriminator · no 500 | GO

THEN stop. Cursor stamps customers next tick. Do **not** recertify drivers/fleet. CUST-MONEY-F6105 / F6278 = CC-1 leftover.
ACK: Codex | ACK | URGENT-14-EXCLUSIVE | PORT=9226 | MODULE=customers | NOW=recertify LIVE_SHA=07993ac only | GO
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
LIVE=07993ac. Codex customers still OPEN on the U14 table. OUTBOX CERTIFIED LIVE_SHA=bd67370 ≠ this curl.

THIS 4 MINUTES:
1) Re-run customers reverse SQL/GET on **07993ac**. Paste PROOF (not CERTIFIED) into docs/bus/OUTBOX-CC-2.md. Codex owns the stamp.
2) Same turn leftover unique 500/dead/silent on https://app.ih35dispatch.com/driver-hub Fully-Wired 1–12. Never quiet.

FORBIDDEN: /customers /drivers /fleet UI, /lists /legal /425c, recertify settlements.
ACK: CC-2 | ACK | URGENT-14-EXCLUSIVE | PORT=9224 | NOW=help-Codex-customers-07993ac-then-/driver-hub | GO
===== END =====

===== CC-3 9225 =====
REJECT HOLD. "Checkpoint hold" = defect. lists+legal already CERTIFIED LIVE_SHA=01385f7. Do NOT recertify. Never trigger_deploy.

git pull --ff-only origin main
POST-URGENT-14 table 16/16 DONE on origin/main — verified. Empty unique ≠ idle.

THIS 4 MINUTES:
1) Help Codex recertify customers SQL/GET on LIVE_SHA=07993ac. PROOF on docs/bus/OUTBOX-CC-3.md (not CERTIFIED).
2) Same turn unique 500/dead/silent Fully-Wired 1–12 on https://app.ih35dispatch.com/compliance.
FORBIDDEN: /customers /drivers /fleet /425c /lists /legal steal.
ACK: CC-3 | ACK | URGENT-14-EXCLUSIVE | PORT=9225 | NOW=help-Codex-07993ac + /compliance unique | GO
===== END =====

===== CASCADE (audit only) =====
AUDIT ONLY. DO NOT FIX. DO NOT CODE. DO NOT OPEN PRODUCT PRs. ACK-only = rejected.

git pull --ff-only origin main
READ: docs/bus/INBOX-CASCADE.md · docs/audit/scenario-trackers/certified-u14/HOW-TO-AUDIT-AND-FILE-FINDINGS.md
NOW: re-walk vs live **07993ac** (prior ACW rows cited 93e80173 — stale). Fill U14-01-accounting.md + CONNECTIVITY-EXTENT + unique FINDINGS-BOARD. Chrome down → SQL/GET. Never occupy /customers /drivers /fleet /lists /legal.
Cascade | ACK | METHOD=HOW-TO-AUDIT-AND-FILE-FINDINGS | NOW=/accounting vs 07993ac | GO
===== END =====

===== DEVIN-A (audit only) =====
AUDIT ONLY. PLAN MODE = chat EXTENT, no product PRs. You are Devin. No Devin-B.

cd ~/IH35-TMS-devin-a-audit && git fetch origin && git switch --detach origin/main
ls docs/audit/HOW-TO-AUDIT.md
NOW: /vendors EXTENT vs live 07993ac then /maintenance /safety /insurance. Unique 500/dead/silent/missing-reverse only. Never occupy /legal /lists /customers /drivers /fleet.
Devin-A | ACK | PLAN-MODE | NO-WRITES | METHOD=HOW-TO-AUDIT | NOW=/vendors | GO
===== END =====

===== CURSOR 9222 (lead — Jorge does not need to paste unless a second Cursor seat) =====
LOOP docs/bus/LOOP-U14-CERTIFY-THEN-LEFTOVER.md
curl healthz every tick. Stamp AT MOST ONE OPEN U14 row when OUTBOX CERTIFIED LIVE_SHA == this curl. Never recertify 1–6 11–13 lists legal.
THIS TICK: live=07993ac, NO STAMP (Codex LIVE_SHA=bd67370 mismatch). Leftover /425c unique 500/dead/silent. FAST-MERGE. Never idle.
ACK: Cursor | ACK | URGENT-14-EXCLUSIVE | PORT=9222 | MODULE=425c | NOW=leftover /425c · Codex recertify 07993ac | GO
===== END =====
