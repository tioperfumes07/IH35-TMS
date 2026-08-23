# U14 OPEN MODULE-BY-MODULE HOPS (owner 2026-08-23)

**Purpose:** seats finish **one module at a time**. Cursor stamps `CERTIFIED` only when **this pull’s** `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` `version` equals the OUTBOX `LIVE_SHA` **and** hops cover Fully-Wired **1–12**.

Unique-FINDING-CLEAN ≠ CERTIFIED. Clicked ≠ CERTIFIED. Scoreboard Built ≠ CERTIFIED.

Do **not** remake proven TESTs / Close / Book Load. CREATE-TEST-THEN-VOID only if a hop is blocked by empty TMS. Empty tables are expected.

Law: `docs/lockdown/URGENT-14-EXCLUSIVE-MODULE-CERTIFY-LAW-2026-08-22.md` · `docs/lockdown/FULLY-WIRED-COMPLETE-BAR-2026-08-13.md`

---

## Before every hop (all seats)

1. `git pull --ff-only origin main`
2. `curl -sS https://api.ih35dispatch.com/api/v1/healthz/shallow` → record `version` as `LIVE_SHA`
3. If `version` ≠ `origin/main` short SHA: **do not stamp**. Keep hopping. Cursor deploys on cadence. CC never `trigger_deploy`.
4. FAST-MERGE: local gate exit 0 → PR → `gh pr merge --squash --delete-branch --admin` **same turn**. Never `gh pr checks --watch`.

---

## CC-3 · PORT 9225 · Chrome · **lists+legal CERTIFIED 01385f7** · leftover POST-U14 (compliance)

Do **not** recertify lists or legal. Leftover `/compliance` then next unclaimed POST row. Never idle.

**Forbidden prefixes:** `/customers` `/drivers` `/fleet` `/banking*` `/dispatch` `/cash-flow` `/finance` `/425c` `/driver-hub`

### MODULE=lists (do this entire block before legal)

App: `https://app.ih35dispatch.com`

| # | Fully-Wired | Required hop (honest) |
|---|-------------|------------------------|
| 1 | Place in product | `/lists` hub from sidebar. Not ComingSoon. |
| 2 | Create/save canonical | Open **one** catalog with `+ Create`. If picker empty after create try, that is a FINDING. Do not invent a second TEST if one labeled TEST already exists. |
| 3 | Money | N/A unless the catalog row posts money. If it does, header+lines + GL purpose. |
| 4 | Forward FKs | Created/opened row shows real FKs (not UUID-in-name). |
| 5 | Reverse | From the related record, link returns to this catalog row. |
| 6 | Matrix Required | Required cells for that leaf honest; no `leafRe:.*`. |
| 7 | Surface bar | Hub + Catalog Index `/lists/catalogs` + Names `/lists/names` + **at least one** dispatch catalog (`/lists/dispatch/load-types`) + **at least one** safety catalog. Search · filter · gear · range where present. |
| 8 | Chrome | No box-in-box. Combobox Escape. `+ Create` not `+ New`. |
| 9 | Picker law | Open a combobox: **`+ Add new` is first row**. Click it → same Lists creator → write same table → appears selected → survives reload. |
| 10 | Entity/RLS | USMCA only. No TRANSP/TRK. |
| 11 | Guard | If you ship a FINDING, ship a guard. If unique-clean, say so honestly. |
| 12 | Live Chrome last | All of the above on **this** `LIVE_SHA`. |

OUTBOX (lists only, when 1–12 honest):

`CC-3 | CERTIFIED | MODULE=lists | LIVE_SHA=<healthz version> | hops=/lists hub · /lists/catalogs · /lists/names · /lists/dispatch/load-types +Add-new-first · search/filter/gear · one labeled TEST create-or-existing · reverse link · USMCA · no 500 | GO`

Then immediately start **legal**. Do not idle.

### MODULE=legal (only after lists OUTBOX CERTIFIED line)

| # | Fully-Wired | Required hop |
|---|-------------|--------------|
| 1 | Place | `/legal` from sidebar |
| 2 | Create | Send Contract (`/legal/contracts?openSend=1`) — type a full TEST label in a template field (must keep all chars). Do not send to a real counterparty if a labeled TEST already exists. |
| 3 | Money | N/A unless a matter posts a fine/bill. If it does, economics complete. |
| 4–5 | F+R | Contract/template/matter FKs both ways. |
| 7 | Surface | `/legal` · `/legal/contracts` · `/legal/templates` · open one template · `/legal/policies` · `/legal/matters` · `/legal/reports` · `/legal/attorney-review` |
| 9 | Picker | `+ Add new` first row on a legal combobox |
| 12 | Live last | Same `LIVE_SHA` as the hop session |

OUTBOX:

`CC-3 | CERTIFIED | MODULE=legal | LIVE_SHA=<healthz version> | hops=/legal home · contracts · send-contract field retains full string · templates · policies · matters · reports · attorney-review · picker +Add-new-first · no 500 | GO`

Then leftover: first **unclaimed** row in `docs/lockdown/POST-URGENT-14-MODULE-SEQUENCE-2026-08-23.md`. Never idle.

---

## Codex · PORT 9226 · reverse SQL/GET · no CDP · modules 7 then 8 then 9

**Forbidden:** Chrome. Steal `/lists` `/legal`. Remake CLASS-F5973 / units audits that already exist.

USMCA company `5c854333-6ea5-4faa-af31-67cb272fef80`. Canonical: `mdata.customers` · `mdata.drivers` · `mdata.units`. RLS 0 is not absence — same txn `set_config('app.bypass_rls','lucia',true)` **and** completeness discriminator on **that** table.

Stamp **one module per OUTBOX line**. Do not batch 7–9 in one CERTIFIED line.

### MODULE=customers

| # | Bar | Hop |
|---|-----|-----|
| 1 | Place | GET customers list 200 + JSON (not HTML). Route mounted. |
| 2 | R=W | List reads `mdata.customers`. One existing row GET by id. Do not invent a new customer if a TEST already exists. |
| 3 | Money | Customer financial/AR surface GET; $0 on TEST is honest. |
| 4–5 | F+R | Customer → load/invoice FKs; reverse from that child back to customer id. |
| 7–9 | Surface/picker (SQL) | Catalogs the UI picker reads exist; `+ Add new` is a CC-3/Cursor Chrome item — Codex proves R=W table + POST path exists. |
| 10 | RLS | USMCA scoped. Completeness discriminator. |
| 12 | Live | Hops vs **this** `LIVE_SHA`. |

`Codex | CERTIFIED | MODULE=customers | LIVE_SHA=<healthz version> | hops=GET /customers 200 count vs mdata.customers · detail existing TEST · reverse FK · RLS discriminator · no 500 | GO`

Then **drivers**. Never idle.

### MODULE=drivers

Same 1–12 on `mdata.drivers` + GET `/drivers`. Do not remake CLASS-F5973. Existing driver detail + reverse load history SQL/GET.

`Codex | CERTIFIED | MODULE=drivers | LIVE_SHA=<healthz version> | hops=GET /drivers vs mdata.drivers · existing detail tabs SQL/GET · reverse load · RLS · no 500 | GO`

Then **fleet**.

### MODULE=fleet

`mdata.units` (owner/lease, **no** `operating_company_id` on units). GET `/fleet` / unit detail. Existing unit OK.

`Codex | CERTIFIED | MODULE=fleet | LIVE_SHA=<healthz version> | hops=GET /fleet vs mdata.units · existing unit VIN detail · owner/lease scope · reverse · no 500 | GO`

Then leftover first unclaimed POST-U14 row. Never idle.

CC-2 may help SQL. **Codex owns the CERTIFIED line.**

---

## Cursor stamp rule (lead)

Copy a seat’s CERTIFIED line into `docs/lockdown/URGENT-14-EXCLUSIVE-MODULE-CERTIFY-LAW-2026-08-22.md` **only if**:

1. `LIVE_SHA` == current healthz `version` (re-curl; do not trust chat)
2. `hops=` covers Fully-Wired 1–12 (or Codex reverse equivalent above)
3. Module is still OPEN

Never recertify 1–6 or 11–13. Never stamp all five OPEN rows from unique-clean.

---

## After U14 closed for a seat

That seat continues `POST-URGENT-14-MODULE-SEQUENCE-2026-08-23.md` until **every** leftover row is done. Idle = defect.
