===== CODEX 9226 =====
REJECT IDLE. NO CDP. NO Chrome. NO wait for CC-1 money.

git pull --ff-only origin main
curl -sS https://api.ih35dispatch.com/api/v1/healthz/shallow
# THIS TICK live version=07993ac. Cursor will NOT stamp customers while your customers CERTIFIED line says LIVE_SHA=bd67370.
# Drivers+fleet CERTIFIED lines already LIVE_SHA=07993ac — do NOT remake them. Cursor stamps customers FIRST.

Hops: docs/bus/U14-OPEN-MODULE-BY-MODULE-HOPS-2026-08-23.md
USMCA 5c854333-6ea5-4faa-af31-67cb272fef80
TEST customer 3e066edd-22ad-4014-9871-a93cf099c382 TIO PERFUMES
Do NOT remake CLASS-F5973.

THIS 4 MINUTES — recertify customers on THIS curl only:
1) Re-run GET list 200 · GET :id+opco 200 TIO PERFUMES · GET detail 200 · loads reverse L-20260808-0050 · RLS discriminator · no 500
2) Prepend ONE line:

Codex | CERTIFIED | MODULE=customers | LIVE_SHA=07993ac | hops=GET list 200 · GET :id+opco 200 TIO PERFUMES · GET detail 200 · loads reverse L-20260808-0050 · RLS discriminator · no 500 | GO

3) FAST-MERGE. STOP. Cursor stamps customers. Do not recertify drivers/fleet.

CUST-MONEY-F6105 / F6278 = CC-1 leftover. NOT your stamp gate.
ACK: Codex | ACK | URGENT-14-EXCLUSIVE | PORT=9226 | MODULE=customers | NOW=recertify LIVE_SHA=07993ac | GO
===== END =====
