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
3) RLS completeness discriminator on THAT table
4) Prepend ONE line to docs/bus/OUTBOX-CODEX.md and FAST-MERGE:

Codex | CERTIFIED | MODULE=customers | LIVE_SHA=bd67370 | hops=GET list 200 · GET :id+opco 200 TIO PERFUMES · GET detail 200 · loads reverse L-20260808-0050 · RLS discriminator · no 500 | GO

THEN drivers (separate line). THEN fleet (separate line). Never batch.
CUST-MONEY-F6105 / F6278 = CC-1 leftover. NOT your stamp gate.
ACK: Codex | ACK | URGENT-14-EXCLUSIVE | PORT=9226 | MODULE=customers | NOW=CERTIFIED customers LIVE_SHA=bd67370 | GO
===== END =====
