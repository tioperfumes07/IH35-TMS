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

---

## LV-005  Relationship Health FIXED — customers.json still records it as FAIL
- module:    customers
- entity:    TRANSP + USMCA
- surface:   `/customers/:id` "Relationship Health" panel
- expected:  Manifest reflects prod reality.
- observed:  **LV-001 is fixed and live-proven on deployed `2c10550`**, but `docs/module-completion/customers.json` still carries LV-001 `status: FAIL` with evidence "500s on every customer… scores never written" — now false. Fix `01d2dfca7` is a confirmed ancestor of the deployed SHA. LIVE: TRANSP EGRO TRANSPORT LLC renders **56.0/100 "Watch"**, Payment subscore **41.4**, beside real AR aging (1–30 $4,200 · 31–60 $4,600 · 90+ $680) — a graded score only possible if the date arithmetic that threw 42883 actually computed. USMCA TIO PERFUMES renders **100.0 "Thriving"**. API 200 ×5 (TRANSP 3, USMCA 2); USMCA ids return 404 while session is TRANSP (isolation). Neon: `master_data.customer_relationship_scores` n_tup_ins **0 → 2,709**, n_live_tup 2,692 — the batch scorer also began succeeding after never inserting once.
- severity:  major (module under-reported 9 of 10; should be 10 of 10)
- LANE:      GUARD-REVIEW (manifest status is GUARD's column)
- neon-check: master_data.customer_relationship_scores n_tup_ins=2709
- status:    OPEN

## LV-006  Banking TRANSP — live tie-out clean
- module:    banking
- entity:    TRANSP
- surface:   `/banking` Accounts
- expected:  Header counts tie to `banking.bank_transactions`.
- observed:  PASS. "Transactions: **6,004**" == Neon TRANSP 6,004. "Uncategorized: 5,837" == 6004−167 categorized (arithmetically consistent). 3 accounts $3,834.49 / $346.11 / $536.78; Amex + Wells Fargo Plaid **Healthy**. Table complete: all_visible 10,999 == n_live_tup 10,999.
- severity:  minor (informational PASS)
- LANE:      n/a
- neon-check: none
- status:    OPEN

## LV-007  Banking USMCA — live tie-out clean
- module:    banking
- entity:    USMCA
- surface:   `/banking` Accounts
- expected:  Header counts tie to Neon; balance ties to Home tile.
- observed:  PASS. "Transactions: **160**" == Neon USMCA 160. Account balance **$93.68** ties the Home cash-position tile ($94). BoA Plaid Healthy, last sync 08:45. Honest note present: DIP/Factoring/Escrow pools read $0 "honest empty until settlements, Faro advances, or escrow postings populate."
- severity:  minor (informational PASS)
- LANE:      n/a
- neon-check: none
- status:    OPEN

## LV-008  Banking USMCA header mixes counter scopes
- module:    banking
- entity:    USMCA
- surface:   `/banking` QBO Sync status line
- expected:  Adjacent counters share a scope, or are labelled with their scope.
- observed:  Header reads `Transactions: 160` (ALL accounts) beside `Uncategorized: 109` (ACTIVE account only). A reader computes 160−109 = 51 categorized; truth is 3. Neon: USMCA has **two** accounts both named "USMCA FREIGHT" — active (112 txns / 109 uncat) and **disconnected** (48 txns / 48 uncat). TRANSP masks the issue because its numbers happen to reconcile (6004−167=5837). NOT a categorization audit — this is counter-scope consistency only.
- severity:  minor
- LANE:      CURSOR
- neon-check: none
- status:    OPEN

## LV-009  Vendors TRANSP — roster ties out; banner shows the CORRECT provenance pattern
- module:    vendors
- entity:    TRANSP
- surface:   `/vendors`
- expected:  Roster ties to `mdata.vendors`; provenance labelled honestly.
- observed:  PASS. UI "1-50 of **564**" == Neon TRANSP active 564 (951 total, deactivated filtered). Table complete: all_visible 2,828 == n_live_tup 2,828. Banner decomposes provenance correctly — "Cloned from QBO: **524** · **40 exceptions**" where 524+40 = 564. **This is the pattern LV-002 was missing on customers**; the correct implementation already existed in the sibling module.
- severity:  minor (informational PASS + reference implementation)
- LANE:      n/a
- neon-check: none
- status:    OPEN

## LV-010  Production email is a silent no-op — every "sent" is a false green
- module:    accounting (crosses all notification paths)
- entity:    TRANSP + USMCA (system-wide)
- surface:   `email.email_queue` / `apps/backend/src/email/factory.ts`
- expected:  `status='sent'` means a message was delivered to a provider.
- observed:  **CONFIRMED (GUARD).** All **232 of 232** rows in `email.email_queue` carry `provider_message_id` matching `console-email-…`, spanning `1779199800031` → `1785865680029` (latest 2026-08-04 17:47Z). **Zero** SES or Postmark ids in the table's entire history. Cause: `factory.ts:7` reads `process.env.EMAIL_PROVIDER ?? "console"` and prod does not set it, so `createConsoleEmailProvider()` is selected — it logs and reports success. Table complete: 232 visible == n_live_tup 232. Effect: every invoice send, alert and notification the system recorded as delivered went to an ephemeral Render log. `status='sent'` on 232 rows is a false green. For a carrier factoring receivables on RECOURSE, "invoice sent" meaning "printed to a log" is a material trust defect.
- severity:  blocker
- LANE:      CLAUDE-CODER-1 (money/notification path)
- neon-check: email.email_queue provider_message_id LIKE 'console-email-%' = 232/232
- status:    CONFIRMED

## LV-011  Invoice SEND hangs on prod — no status flip, no audit row, no queued email
- module:    accounting
- entity:    USMCA (reproduced); TRANSP untested — send path is shared
- surface:   `POST /api/v1/accounting/invoices/:id/send` · invoice detail "Send" button
- expected:  Send flips `draft → sent`, stamps `sent_at`, queues email, and (unevidenced) writes the WIRE-04 audit row.
- observed:  **Send neither succeeds nor fails — it HANGS, and nothing commits.** Reproduced twice on deployed `2c10550`: (1) UI Send button spun **16s+** with status unchanged; (2) a well-formed direct API call **timed out at 45s** and froze the renderer. Authoritative Neon read after both attempts shows ZERO side effects — invoice `53b8ddb3-5597-4975-a893-3d4cde90c6b6` still `status='draft'`, `sent_at` NULL, `sent_without_delivery_evidence` audit rows **0** (baseline 0), `email_queue` **232** (baseline 232). Corroborating: `max(sent_at)` across ALL invoices is **2026-05-19** — ~11 weeks with zero successful sends. **Consequence: invoices cannot be sent from the TMS at all.** This also BLOCKS WIRE-04 — its counter cannot fire because nothing downstream of Send executes; the counter is not defective, the send path is.
- repro:     draft invoice, no load. `POST …/invoices/<id>/send?operating_company_id=<opco>` with header `Idempotency-Key: <valid UUID>` and body `{}`. NOTE the contract (read from `invoices.routes.ts:728`, not guessed): Idempotency-Key must be a **valid UUID**, and `operating_company_id` is a **query** param, not body — three earlier 400s were malformed calls; **the hang occurs only on the VALID path**.
- severity:  blocker
- LANE:      CLAUDE-CODER-1 (money)
- neon-check: invoice 53b8ddb3-5597-4975-a893-3d4cde90c6b6 remains draft / sent_at NULL
- status:    OPEN

**TEST ARTIFACT LEFT IN PLACE ON PURPOSE (not litter):** `INV-2026-00003` (`53b8ddb3-5597-4975-a893-3d4cde90c6b6`, USMCA, draft, $1,200, line labeled "TEST DATA — WIRE-04 …") is the live reproduction for LV-011. Delete it together with `GUARD-TEST-customers-name-USMCA` (`0f65bf5e…`) and `GUARD-TEST-customers-name-TRANSP` (`df25eb7a…`) under the fixture carve-out AFTER CC-1 reproduces — destroying it now would remove the evidence.
