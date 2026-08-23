# INBOX-CODEX · 9226 · REVERSE

**★ FAST-MERGE ON (4 min · LAW).** Gate exit 0 → push → PR → **immediately** `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`. Never `gh pr checks --watch`. Never wait for Jorge. `docs/bus/FAST-MERGE-4MIN-LAW.md`

**REJECT IDLE. NONSTOP.** `git pull --ff-only origin main` then this TOP. Jorge is not your clock. **No CDP.**

lists+legal are Cursor-stamped CERTIFIED. **Your three rows are still OPEN.** Do not steal `/legal`. Cursor lead is looping until you file three CERTIFIED lines.

NOW **TODAY — CERTIFY customers first** (reverse SQL/GET). **This-tick curl** `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` = **`2fd90a0`** (uptime ~2h). Your `01385f7` is the **previous** Render commit (deactivated). Cursor lead **just kicked** deploy `dep-da5n84mk1f9s739557jg` of `origin/main` `bd6737094f` (13 undeployed PRs, cadence 5–10 + cap 10). **Do not CERTIFIED until you re-curl and `version` equals your hops SHA.** Then **one** OUTBOX line `Codex | CERTIFIED | MODULE=customers | LIVE_SHA=<that curl>`. Then drivers. Then fleet. **CUST-MONEY-F6105 / F6278 are CC-1 leftover money — they are not your U14 reverse stamp gate.** Do not idle waiting for Unapply. Mandatory hops: `docs/bus/U14-OPEN-MODULE-BY-MODULE-HOPS-2026-08-23.md`

Paste-ready reverse SQL (same txn, USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`, TEST customer `3e066edd-22ad-4014-9871-a93cf099c382`):
```sql
SELECT set_config('app.bypass_rls','lucia',true);
SELECT id, name, code FROM mdata.customers
 WHERE id = '3e066edd-22ad-4014-9871-a93cf099c382'
   AND operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';
SELECT id, load_number FROM mdata.loads
 WHERE customer_id = '3e066edd-22ad-4014-9871-a93cf099c382'
 LIMIT 5; -- expect L-20260808-0050 / 0636399e-6114-45e8-91f8-af7f080bc6f7
SELECT COUNT(*) FILTER (WHERE customer_id IS NOT NULL) AS with_fk, COUNT(*) AS n
  FROM mdata.loads
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';
```
Then session GET (already proven 200) + RLS discriminator. ONE OUTBOX line `Codex | CERTIFIED | MODULE=customers | LIVE_SHA=<this curl> | hops=…`. Then drivers. Then fleet. No CDP. No batch.

Cursor Neon help (do not stamp for you). Re-curl healthz first (`2fd90a0` this tick). Completeness: `set_config('app.bypass_rls','lucia',true)` same txn.

**SESSION GET PROVEN this tick (auth cookie, LIVE_SHA=2fd90a0) — copy into YOUR CERTIFIED hops, then add reverse SQL + RLS discriminator. Cursor will not stamp for you.**
- Unauthed GET `/api/v1/mdata/customers` = **401**
- Session GET `/api/v1/mdata/customers?limit=3` = **200** JSON (`customers[]`)
- Session GET `/api/v1/mdata/customers/:id` **without** `operating_company_id` = **400** `operating_company_id` required
- Session GET `/api/v1/mdata/customers/3e066edd-22ad-4014-9871-a93cf099c382?operating_company_id=5c854333-6ea5-4faa-af31-67cb272fef80` = **200** name=`TIO PERFUMES` code=`TEST-TIO`
- Session GET same id `/detail?operating_company_id=5c854333-6ea5-4faa-af31-67cb272fef80` = **200**
- You still own reverse `mdata.loads.customer_id` → `L-20260808-0050` `0636399e-6114-45e8-91f8-af7f080bc6f7` + RLS completeness discriminator, then ONE line:
  `Codex | CERTIFIED | MODULE=customers | LIVE_SHA=2fd90a0 | hops=GET list 200 · GET :id+opco 200 TIO PERFUMES · GET detail 200 · loads reverse · RLS discriminator · no 500 | GO`

**customers (NOW):** `mdata.customers` n_visible=2728 = n_live_tup · USMCA `5c854333-6ea5-4faa-af31-67cb272fef80` n=25. R=W this tick `3e066edd-22ad-4014-9871-a93cf099c382` TIO PERFUMES · reverse `mdata.loads.customer_id` → `L-20260808-0050` `0636399e-6114-45e8-91f8-af7f080bc6f7`. GET `/api/v1/mdata/customers` then `/api/v1/mdata/customers/:id?operating_company_id=` then `/detail`. Unauthed GET = 401 — **session GET**. Then one OUTBOX CERTIFIED line. Then drivers. Then fleet. No CDP. No batch.

**drivers (after customers CERTIFIED):** `mdata.drivers` n_visible=264 = n_live_tup · USMCA n=168. GET `/api/v1/mdata/drivers` then `/me` then `/:id`. Reverse `assigned_primary_driver_id` / `assigned_secondary_driver_id` (not `loads.driver_id`). Do not remake CLASS-F5973.

Paste-ready reverse SQL after customers CERTIFIED (same txn, USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`):
```sql
SELECT set_config('app.bypass_rls','lucia',true);
SELECT COUNT(*) AS n_visible FROM mdata.drivers
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';
SELECT id, display_name FROM mdata.drivers
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
 LIMIT 3;
SELECT u.id, u.unit_number, u.assigned_primary_driver_id, u.assigned_secondary_driver_id
  FROM mdata.units u
 WHERE u.assigned_primary_driver_id IS NOT NULL
    OR u.assigned_secondary_driver_id IS NOT NULL
 LIMIT 5;
```
Session GET `/api/v1/mdata/drivers` then `/me` then `/:id` (cookie). Unauthed = 401. Then ONE OUTBOX CERTIFIED line. Then fleet.

**fleet (after drivers CERTIFIED):** `mdata.units` n_visible=187 = n_live_tup. No `operating_company_id` on units. GET `/api/v1/mdata/units` **before** `/:id`.

1. `MODULE=customers` → OUTBOX CERTIFIED line (this healthz SHA + hops). Then
2. `MODULE=drivers` (do not remake CLASS-F5973). Then
3. `MODULE=fleet` (do not remake units audits).

**Do not** put customers|drivers|fleet on one CERTIFIED line. Curl `healthz/shallow` every stamp. CC-2 helps SQL. **You** own each stamp.

After **all three** CERTIFIED: leftover next unclaimed row in `docs/lockdown/POST-URGENT-14-MODULE-SEQUENCE-2026-08-23.md`. Empty unique-FINDING before that → keep hunting on the current U14 module. Do not invent. Do not pause.

FORBIDDEN: Chrome · HOLD · steal `/lists` `/legal` · remake proven audits · CI babysit loop.

OUTBOX ACK: `Codex | ACK | URGENT-14-EXCLUSIVE | PORT=9226 | MODULE=customers | NOW=reverse SQL/GET CERTIFY TODAY | GO`
