# LIVE-VERIFY FINDINGS — 2026-08-04

**Pass:** live prod click-through of the 4 modules flagged `complete:true` (customers, eld, help, home),
both entities (TRANSP + USMCA), authenticated as the owner, browser-driven.
**App:** https://app.ih35dispatch.com · **Backend version observed:** `8d2f67b` (matches `/api/v1/healthz/shallow`).
**Neon:** project `tiny-field-89581227`, prod branch `br-fancy-credit-akjnd07a`.
**Author:** Claude Coder (terminal 2). **Sole writer of this file — append only.**

**Scope exclusions honored:** load↔expense/fuel linkage and transaction categorization were NOT audited and are
NOT reported (owner ruling 2026-08-04: pre-operational imported data, empty load link is the EXPECTED state).
Nothing was categorized and no load link was invented.

**Verify-only:** no app code edited, no fix applied, no `complete` / `prod_verified` flag flipped.

---

## LV-001  Customer Relationship Health endpoint 500s on every customer (Postgres 42883)
- module:    customers
- entity:    TRANSP + USMCA (reproduced in both)
- surface:   `/customers/:id` (CustomerDetail) → "Relationship Health" panel · API `GET /api/v1/customers/:uuid/relationship-score`
- expected:  Panel renders a relationship score, or an honest empty state if no score exists yet.
- observed:  Panel renders red text "Could not load relationship score." on every customer opened.
             Live API call returns **HTTP 500** with body
             `{"statusCode":500,"code":"42883","error":"Internal Server Error","message":"function pg_catalog.extract(unknown, integer) does not exist"}`.
             Root cause located: `apps/backend/src/customers/relationship-score/scorer.service.ts:126` —
             `GREATEST(EXTRACT(DAY FROM (current_date - i.issue_date)), 0)`. In PostgreSQL `date - date`
             yields **integer** (day count), not an interval, so `EXTRACT(DAY FROM <integer>)` throws 42883.
             Neon corroboration (bypass + discriminator): `master_data.customer_relationship_scores`
             has `count=0`, `n_live_tup=0`, **`n_tup_ins=0`** — the upsert has NEVER succeeded on prod,
             consistent with the query throwing on every call. Table exists and `ih35_app` has USAGE+SELECT,
             so this is neither a phantom-schema nor a grants gap.
             Reproduced on 3 distinct customers: `aea4f538` (TRANSP), `0f65bf5e` (USMCA), `df25eb7a` (TRANSP).
             screenshot ref: ss_9915zaur3 (TRANSP), ss_6362ypuhb (TRANSP new), ss_8144i9k9n (USMCA)
- severity:  major
- LANE:      CLAUDE-CODER-1
- neon-check: none (defect is a read-path SQL error; no row created for it)
- status:    OPEN

## LV-002  "Cloned from QBO: N" banner asserts false QBO provenance for TMS-native customers
- module:    customers
- entity:    USMCA (label is wrong here; TRANSP coincidentally matches)
- surface:   `/customers` — "QBO Customers · Cloned from QBO: N · Last reconciled: …" header banner
- expected:  A counter labelled "Cloned from QBO" should report rows actually cloned from QuickBooks
             (i.e. the QBO mirror `mdata.qbo_customers`), or be labelled for what it really counts.
             Per locked decision §8.5, **USMCA has no QuickBooks** and is never part of the clone/reconcile,
             so the correct USMCA value is 0.
- observed:  In USMCA the banner read "Cloned from QBO: 1", then "Cloned from QBO: 2" immediately after I
             created a TMS-native customer that has never existed in QuickBooks. Neon (bypass):
             `mdata.qbo_customers` for USMCA = **0** rows, while `mdata.customers` (local, active) = 2.
             The banner is therefore counting local customers and labelling their provenance as QBO-cloned.
             In TRANSP the two happen to be equal (mirror 1243 = local active 1243) so the mislabel is
             invisible there — it only surfaces on an entity with no QBO realm.
             screenshot ref: ss_5306drswr (USMCA "Cloned from QBO: 2"), ss_20068n0bu (TRANSP 1243)
- severity:  major
- LANE:      CURSOR
- neon-check: GUARD-TEST-customers-name-USMCA
- status:    OPEN

## LV-003  help.json stored aggregate fields contradict its own items (says "0 of 5", actually 5 of 5)
- module:    help
- entity:    N/A (repo manifest, not entity-scoped)
- surface:   `docs/module-completion/help.json`
- expected:  Stored `pass_count` / `total_count` / `progress` agree with `items[]` and with `complete:true`.
- observed:  `"complete": true` with all 5 items `"status": "PASS"`, but `"pass_count": 0`,
             `"total_count": 5`, `"progress": "0 of 5"`. CI does NOT catch this: verify-step 1431 →
             `scripts/verify-module-completion.mjs` **derives** N/M from `items[]`
             (`return { N, M, open, progress: ... }`, line 78) and never reads the stored aggregate fields,
             so stored values can drift arbitrarily while the guard stays green. Any consumer that reads the
             stored fields will report Help as 0 of 5. Note: open PR #4295 ("scoreboard integrity — honest
             N of M") may already address this class — fixer should check before duplicating.
             Separately, `help.json` item HELP-VERIFY-01 evidence self-states "Browser click-through named
             UNVERIFIED only for screenshots" — that gap is now closed by this pass (see summary).
- severity:  minor
- LANE:      CLAUDE-CODER-1
- neon-check: none
- status:    OPEN

## LV-004  home.json omits pass_count / total_count / progress entirely while complete:true
- module:    home
- entity:    N/A (repo manifest, not entity-scoped)
- surface:   `docs/module-completion/home.json`
- expected:  Same aggregate fields present and correct as in customers.json / eld.json (which are consistent).
- observed:  `home.json` carries `"complete": true` and `"M": 1` but has **no** `pass_count`, `total_count`,
             or `progress` key at all. Same unguarded-field root cause as LV-003 (guard derives its own N/M).
             Also `"live_sha": "4de9adb"` is stale — prod is serving `8d2f67b` as of this pass.
- severity:  minor
- LANE:      CLAUDE-CODER-1
- neon-check: none
- status:    OPEN

---

## Test rows created this pass (for GUARD Neon re-verification)

Both created live through the UI create-drawer, both confirmed written to the canonical table
`mdata.customers` with the correct `operating_company_id`, both currently ACTIVE (`deactivated_at IS NULL`).

| Row name | module | field | entity | canonical table | id | verified |
|---|---|---|---|---|---|---|
| `GUARD-TEST-customers-name-USMCA` | customers | customer_name | USMCA | `mdata.customers` | `0f65bf5e-07f9-46e4-babc-f2bb1b16b121` | opco `5c854333-6ea5-4faa-af31-67cb272fef80`, type `direct_shipper`, created 2026-08-04T16:35:03.912Z |
| `GUARD-TEST-customers-name-TRANSP` | customers | customer_name | TRANSP | `mdata.customers` | `df25eb7a-1320-43dc-ad84-a5b6d8d84aaa` | opco `91e0bf0a-133f-4ce8-a734-2586cfa66d96`, type `broker`, created 2026-08-04T16:42:51.298Z |

Cross-entity isolation was proven **live**: with the app switched to TRANSP, searching the customer roster for
`GUARD-TEST` returned "No customers found." — the USMCA-created row is not visible to TRANSP.

Method note for GUARD: `mdata.customers` RLS scopes SELECT by `org.user_accessible_company_ids()`
(user membership), **not** by the `app.operating_company_id` GUC. A GUC-only isolation test on this table
returns 0 for everything and proves nothing (no positive control) — use the live entity switch, or a
membership-scoped session.

## Surfaces verified PASS this pass (no finding)

- **home** — HOME-S01 both entities. TRANSP cash $4,717 / 50 trucks / 71 trailers / QBO vendors 911 /
  customers synced 1243 / Attention "Overdue bills Count 277" / 7 driver day-summaries with real miles.
  USMCA cash $94 / 2 trucks / QBO vendors 0 / "No attention items". Range selector (Today/7d/MTD) relabels
  and refetches. Every figure differs by entity.
- **eld** — ELD-S01/T01/T02/T03/T04 both entities. TRANSP Live Duty Status = 4 drivers with real HOS clocks;
  Unidentified Driving = 11 real telematics rows. USMCA = honest empty naming the quiet ingest.
  Certifications + Settings honest-empty naming the missing endpoint.
- **help** — HELP-S01..S04 both entities. 8 categories incl. Driver App; search returns ranked results;
  article renders full content (no seed stub); `/help/overview` and `/help/runbooks` (10 runbooks) render.
- **customers** — CUST-S01 (TRANSP 1243 / USMCA 1, exact Neon tie-out), S02 (transaction list matches
  `accounting.invoices` row-for-row), S03 (all 9 coming-state tabs carry distinct honest copy naming the
  missing source), CHROME-01/02/03, LINK-01 (populated line path in USMCA → income account 4000; honest
  sparse-lines copy in TRANSP), LINK-02 (COI true-empty: `insurance.coi_request` count 0, n_live_tup 0,
  n_tup_ins 0). Universal picker law 7/7 on the Create Customer drawer + Payment terms picker
  ("+ Create payment term" is the FIRST row).
