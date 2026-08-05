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

## LV-011 UPDATE  RESOLVED — invoice send fix live-verified
- module:    accounting · entity: USMCA (path is shared, so system-wide)
- observed:  **FIXED and live-proven** on deployed build including `890ce5cc6` (#4321, ACCT-F66). Same request that previously hung past 45s now returns **HTTP 200 in 915 ms** with `status:"sent"`, `sent_at 2026-08-04T22:21:24.011Z`. Neon confirms the flip plus **2 balanced GL postings** against the invoice — so skeleton hop 8 (GL) works. CC-1's root cause matches my evidence exactly: `postSourceTransaction` opened its OWN connection via `withCurrentUser` while the caller held a row lock, blocking on a lock only the caller could release — a hang, not a deadlock, which is why Postgres never broke it. Fix: reuse the same client (same txn, no second lock holder).
- status:    RESOLVED (GUARD to close)

## LV-012  WIRE-04 counter does NOT fire on a genuinely unevidenced send
- module:    accounting
- entity:    USMCA (send path shared — treat as system-wide until TRANSP is exercised)
- surface:   `POST /api/v1/accounting/invoices/:id/send` · `accounting.invoice.sent_without_delivery_evidence`
- expected:  ACCT-F61 (#4301) states the unevidenced-send path "now appends a durable, append-only row to audit.audit_events" so the exposure is measurable BEFORE the flag is enforced.
- observed:  **It does not.** `INV-2026-00003` (`53b8ddb3-5597-4975-a893-3d4cde90c6b6`) has `source_load_id = NULL` and `delivery_date = NULL` — no delivery evidence of any kind — and was sent successfully at 22:21:24Z (HTTP 200, status flipped, 2 GL postings). Yet `audit.audit_events WHERE event_class='accounting.invoice.sent_without_delivery_evidence'` is **0**, unchanged from the pre-send baseline of 0. The read is sound, not RLS-masked: `audit.audit_events` shows 2,200,767 visible vs n_live_tup 2,200,096 on the same table. Previously this could be dismissed as "wired but unexercised" because the send path hung (LV-011); with the hang fixed, the counter has now been genuinely exercised and stayed at zero. **The measurement ACCT-F61 was built to provide still does not exist, so the decision to flip INVOICE_SEND_REQUIRES_DELIVERY_EVIDENCE would still rest on no number.** IH35 factors receivables with Faro on RECOURSE, so each unevidenced send is unmeasured chargeback risk.
- severity:  blocker
- LANE:      CLAUDE-CODER-1 (money)
- neon-check: sent_without_delivery_evidence = 0 after a null-evidence send
- status:    OPEN

## LV-013  Send marks status='sent' while enqueuing NO email — flagged sent, nothing sent
- module:    accounting
- entity:    USMCA (shared path)
- surface:   invoice send → `email.email_queue`
- expected:  A successful send produces a delivery artifact (queued message), or the invoice is not marked sent.
- observed:  `email.email_queue` was **232 before and 232 after** the successful send — the send enqueued nothing at all, yet the invoice now reads `status='sent'` with `sent_at` stamped. Combined with **LV-010** (provider is console-only: 232/232 `provider_message_id` = `console-email-…`), an invoice can be recorded as sent with **no delivery artifact of any kind**. This is the precise "flagged sent that didn't send" state the owner instructed must never be left behind, and on a recourse-factored AR it is a customer-facing trust defect: the ledger asserts the customer was billed when nothing left the building.
- severity:  major
- LANE:      CLAUDE-CODER-1 (money)
- neon-check: email.email_queue count unchanged 232 -> 232 across a 200-OK send
- status:    OPEN

**HOP 0 GATE (my recommendation):** do NOT book the first real going-forward load until LV-012 and LV-013 are fixed. Send no longer hangs, but hop 7 would mark a REAL customer invoice `sent` while producing no email and no unevidenced-send record — manufacturing exactly the false state Hop 0 is meant to prove against. LV-011 alone is not sufficient clearance.

## LV-014  Bills list prints a raw vendor UUID where the name exists — and the backfill missed these rows
- module:    accounting · bills
- entity:    USMCA (TRANSP not yet exercised on this surface)
- surface:   `/accounting/bills` — Vendor column
- expected:  Vendor column shows the vendor name, or an honest placeholder when no vendor is linked. Never an internal key.
- observed:  All 3 USMCA bills render the Vendor cell as the raw UUID **`7727c2cc-eb71-4139-86ee-1b0d33f611df`**. That vendor EXISTS and has a name — Neon: `mdata.vendors` id `7727c2cc…` = **"USMCA Audit Vendor 20260722"**. Root cause is a data gap the UI then reports misleadingly: all 3 bills carry the correct `vendor_id = 7727c2cc…`, but **2 of 3 have `mdata_vendor_id = NULL`**; only the third has it populated and resolves the name correctly. The list joins on `mdata_vendor_id`, so on a miss it falls back to printing the key. **Same class as ledger row 3** (`accounting.bills.mdata_vendor_id IS NULL`, 2 of 16,246, backfilled by #4009) — these USMCA rows were MISSED by that backfill.
- two distinct halves (fix both):  (a) DATA — backfill `mdata_vendor_id = vendor_id` where the target resolves in `mdata.vendors`; trivially safe here because `vendor_id` is already correct. (b) HONESTY — when the join misses, render an honest fallback, never an internal key. **The sibling surface already does this right: `/accounting/expenses` renders `—` for absent Load/WO/Vendor.** Same app, same missing-link condition, two behaviors — one honest, one misleading. A CPA or auditor reading "7727c2cc-eb71-…" in a Vendor column cannot distinguish a data gap from a vendor actually named that.
- severity:  major
- LANE:      CLAUDE-CODER-1 (accounting data) + CURSOR (list render fallback)
- neon-check: bills vendor_id=7727c2cc… with mdata_vendor_id NULL on 2 of 3 USMCA bills; mdata.vendors 7727c2cc… = "USMCA Audit Vendor 20260722"
- status:    OPEN

## LV-015  accounting ECON density claims verified live — imported history correctly NOT a defect
- module:    accounting
- entity:    ALL
- surface:   ACCT-ECON-01..05 acceptance items
- expected:  Densities non-zero and real, per the manifest's PASS claims (which carried `prod_verified: false` on all 39 items).
- observed:  **PASS, live-verified with completeness discriminator** (visible == n_live_tup on the same table): bills **16,250**, bill_lines **155,274** (~9.5 lines/bill, genuinely dense), bill_payments **6,544**, AR payments **12,124**, expenses **27,072**, vendor_credits **6** (live path exercised, not empty), journal_entries **1,785**, journal_entry_postings **3,599**. **Explicitly NOT reported as a defect:** 1,785 JEs against ~55k money documents looks like GL-dark, but the origin split proves otherwise — **16,245 of 16,250 bills are `source_system='qbo'` vs 5 `tms`**. QBO is system-of-record for imported history under parallel books, so unposted imported bills are the EXPECTED state. Consistent with the CLS-GL-DARK rebaseline (ledger row 672). Expenses surface corroborates the TMS-native path works: both USMCA expenses are `Posted` with real JE ids (`ff286e60`, `b927818f`) and GL Posted.
- severity:  minor (informational PASS)
- LANE:      n/a — evidence for GUARD toward accounting prod_verified
- neon-check: origin split 16,245 qbo / 5 tms
- status:    OPEN

## LV-016  LV-014 is NOT a Bills-page quirk — the raw-key fallback is a shared accounting-list pattern that degrades on TMS-NATIVE rows
- module:    accounting · bill_payments (and bills — see LV-014)
- entity:    TRANSP (real volume) + USMCA
- surface:   `/accounting/bill-payments` Vendor ID column
- expected:  A vendor reference renders as something an operator/auditor can read, on every row, regardless of where the row came from.
- observed:  TRANSP Bill Payments renders **$243,897.73** across real check rows with QBO-style memos. Vendor ID shows short readable QBO ids on the imported rows (**2210, 2232, 1544, 2174, 2118, 2244, 1347, 2231**) — but the **one TMS-native row** (`AUDIT-GL-PROOF-001`) falls back to a raw UUID **`f62e8ffb-f898-465b-9f7d-ff6c9c0101ec`**. This is the SAME class as LV-014 but **inverted**, and that inversion is the finding: it is not a Bills-page bug, it is a **shared render pattern across accounting lists**, and it degrades specifically on **TMS-native** rows while QBO-imported rows look fine. **Scope warning for the fixer: fixing only `/accounting/bills` would leave this live on bill-payments (and likely other lists).** Direction of travel matters — as the TMS becomes system of record and native rows grow, the proportion of rows showing a raw key INCREASES. Today it is 1 row in a list of imported history; post-cutover it is the default.
- also observed (NOT a defect):  every bill-payment row reads `JE —` and `Reconciled: Unmatched` except the single AUDIT-GL-PROOF row (`JE dcbe5700`). Consistent with imported history being unposted under parallel books (QBO is SoR) — explicitly NOT reported as GL-dark. It does mean the bill-payment -> GL chain currently has exactly ONE live proof point.
- severity:  major (scope correction to LV-014; same fix, wider surface)
- LANE:      CURSOR (shared list render) + CLAUDE-CODER-1 (vendor-id resolution/backfill)
- neon-check: none — pure render observation, cross-checked against LV-014's Neon evidence
- status:    OPEN

## LV-017  accounting SURF-02/03 live-verified PASS (both entities where data exists)
- module:    accounting
- entity:    TRANSP + USMCA
- surface:   `/accounting/expenses`, `/accounting/bill-payments`
- observed:  **PASS.** Expenses (USMCA): 2 rows, both `Posted` with real JE ids (`ff286e60`, `b927818f`) and GL Posted — the expense->JE->GL chain is genuinely wired and drillable; absent Load/WO/Vendor render as honest em-dashes. Bill payments (USMCA): honest empty "No bill payments found" with full ledger chrome and an Unpaid-bill selector — correct, since all 6,544 bill_payments are TRANSP/TRK. Bill payments (TRANSP): real ledger, $243,897.73 total, per-row Void action, memos tying to bill numbers and check numbers. **Correction to my own earlier read:** I first saw `/accounting/bill-payments` render blank and nearly filed it; a reload showed a fully working page — it was slow first paint, not a broken route. Verified canonical in `manifest.tsx` and the subnav before concluding either way.
- severity:  minor (informational PASS)
- LANE:      n/a — evidence toward accounting prod_verified
- neon-check: bill_payments 6,544 total; USMCA share 0
- status:    OPEN

## LV-018  Payments header total is a PAGE subtotal presented as the ledger total — understates by 99%
- module:    accounting · payments
- entity:    TRANSP
- surface:   `/accounting/payments` — header "Amount / Applied / Unapplied"
- expected:  A money total on a ledger surface either covers the query, or is unambiguously labelled as a page/filter subtotal.
- observed:  Header reads **"Amount: $398,850.00 · Applied: $398,845.00 · Unapplied: $5.00"** with **no row count, no page qualifier, no filter chip**. Proven on prod that this is the FIRST PAGE ONLY: the sum of the **100 newest** TRANSP payments is **exactly $398,850.00** — a byte-for-byte match to the header. The real TRANSP ledger is **$39,940,290.99 across 12,124 payments** (`accounting.payments`, voided excluded; complete: 12,124 visible == n_live_tup 12,124). **The surface understates customer payments by ~$39.5M, i.e. 99%.** The figure is not false as a page subtotal — it is UNLABELLED, which makes it false in context. Same defect CLASS as ledger row 2 (bank all-accounts aggregate not reconciling to the per-account sum): a header computed over the fetched page instead of the query.
- why this is the most severe finding of the sweep:  it is a money number on an A/R surface that a CPA, auditor, lender or factor could read directly, and its internal arithmetic RECONCILES ($398,850 − $398,845 = $5), which is precisely what makes it look trustworthy. A wrong number that self-checks is more dangerous than one that obviously breaks.
- severity:  blocker
- LANE:      CLAUDE-CODER-1 (money surface totals)
- neon-check: sum of 100 newest TRANSP payments = 398850.00 == header; full ledger 39,940,290.99 / 12,124 rows
- status:    OPEN

## LV-019  SCOPE CORRECTION to LV-016 — customer references resolve correctly; only the VENDOR path falls back to a raw key
- module:    accounting
- entity:    TRANSP
- surface:   `/accounting/payments` vs `/accounting/bills` + `/accounting/bill-payments`
- observed:  **My LV-016 scope was too wide and I am narrowing it before anyone builds to it.** `/accounting/payments` resolves **customer** references correctly on every row — ACORN EXPRESS, ES Logistics International LLC, Rehmann Transportation Corp., EGRO TRANSPORT LLC, Hummingbird Logistix LLC — with **no raw UUIDs anywhere**, including on the TMS-native row (`GL-PROOF-CPAY-001`, correctly shown UNAPPLIED $5.00). So the raw-key fallback is **NOT** a universal accounting-list pattern as LV-016 implied; it is specific to the **vendor** reference on bills / bill-payments (LV-014, LV-016). Fix scope is therefore the vendor resolution path, not every list — materially cheaper and lower-risk than my earlier wording suggested.
- severity:  minor (correction to my own finding; prevents an over-scoped fix)
- LANE:      CURSOR + CLAUDE-CODER-1 (same owners as LV-014/016)
- neon-check: none — render comparison across sibling surfaces
- status:    OPEN

## LV-020  ACCT-SURF-04 Receive Payment — surface PASS apart from LV-018
- module:    accounting · entity: TRANSP
- observed:  Payments list renders real A/R: 12,124 payments on the ledger, per-row Applied / Unapplied / Status (`FULLY APPLIED` vs a single honest `UNAPPLIED`), Method, Reference, Bank txn column, `+ Record Payment` and `Invoices` actions. Customer names resolve. Application-status honesty is correct per row. **The surface itself works; the defect is the header aggregate (LV-018).** I nearly recorded this as a clean PASS because the header arithmetic self-reconciles — noting that explicitly so the next reader does not repeat it.
- severity:  minor (informational)
- LANE:      n/a — evidence toward accounting prod_verified
## LV-021  journal_entry_type is never stamped by the AUTO posting engine — LINK-01 passes its "not island" bar while JE-type reporting is blind
- module:    accounting
- entity:    ALL
- surface:   `accounting.journal_entries.journal_entry_type_id` -> `catalogs.journal_entry_types` (acceptance item ACCT-LINK-01)
- expected:  ACCT-LINK-01 asserts "journal_entry_types inbound FK from journal_entries (not island)". The catalog exists so GL entries can be classified by source/purpose and reported on.
- observed:  **The FK is not an island — 11 rows reference it — so LINK-01 technically PASSES. But the catalog is unusable in practice.** Split by source: `manual` JEs are **2 of 2 typed (100%)** — the manual path stamps it correctly every time. `auto` JEs are **9 of 1,783 typed (0.5%)**. And of the **1,598 JEs created since 2026-08-01, ZERO are typed**. So the automatic posting engine — which writes essentially every JE in the system — never stamps `journal_entry_type_id`. **Consequence: any GL report or filter keyed on entry type is blind to 99.5% of the ledger, including 100% of everything posted this month.**
- why I am recording it despite the item passing:  this is a case where the acceptance wording ("not island") is satisfied while the property the catalog exists to provide does not hold. A non-zero FK count is not the same as a usable classification. Flagging so the distinction is decided deliberately rather than inherited from a green checkmark.
- what I did NOT conclude:  I am not asserting the auto poster is *required* to stamp a type — that is a design decision I cannot read off the data, and the manual path working proves the column and catalog are wired correctly. CC-1 should confirm intent: either the auto poster should classify (and this is a real gap), or entry-type is manual-only by design (and ACCT-LINK-01's wording should say so, because today it reads as a general guarantee).
- also measured (LINK layer, live, for the record):  `catalogs.accounts.detail_type_id` populated on **48 of 1,441** accounts; `accounting.bills.unit_id` on **300** bills; `bills.linked_work_order_uuid` on **1**; `banking.bank_transactions.matched_journal_entry_id` on **170**. Bank-match density is consistent with ledger row 2's categorized count (167) and is NOT reported as a defect — imported history is legitimately unmatched under parallel books.
- severity:  major (reporting integrity, not data loss)
- LANE:      CLAUDE-CODER-1 (posting engine) — confirm intent first
- neon-check: manual 2/2 typed; auto 9/1783 typed; JEs since 2026-08-01 = 1,598 with 0 typed
- status:    OPEN

## LV-022  LV-010 FIXED honestly (`logged_only`) — but LV-013 REMAINS: a sent invoice still produces no queue row at all
- module:    accounting · email
- entity:    USMCA (send path is shared — system-wide)
- surface:   invoice send -> `email.email_queue`
- expected:  Every invoice recorded `status='sent'` has a matching delivery artifact, even when the provider is a console stub.
- observed:  Re-tested on deployed `ec0d65f` (includes #4319 and #4313). Sent `INV-2026-00001` (`e4d2ebdd…`, USMCA, TEST-TIO, no email on file): **HTTP 200 in 579 ms, status flipped to `sent`**. Results split:
  **(a) LV-010 is FIXED, and fixed the right way.** `email.email_queue` rows now carry status **`logged_only`** instead of `sent` (newest row: `logged_only / console-email-1785865680029`; non-console provider ids still 0). CC-1 did not fake delivery — they stopped the ledger from CLAIMING delivery. The false green is gone: the table no longer asserts 232 messages were sent when the provider is a console stub.
  **(b) LV-013 is NOT fixed.** `email.email_queue` was **232 before and 232 after** this successful send — the send created **no queue row at all**, not even a `logged_only` one. So an invoice can still reach `status='sent'` with **zero** delivery artifact of any kind. That is precisely the "flagged sent that didn't send" state the owner ruled must never be left behind.
  **(c) WIRE-04 counter fired again** (1 -> 2), confirming LV-012's fix is stable across repeats and not a one-shot.
- why the distinction matters:  LV-010 and LV-013 look like one problem and are not. LV-010 was "the queue lies about what it did" — fixed. LV-013 is "the send does not reach the queue" — still open. Closing LV-010 does not close LV-013, and a reader could easily assume it did.
- severity:  major (last remaining Hop 0 blocker)
- LANE:      CLAUDE-CODER-1 (money/notification path)
- neon-check: email_queue 232 -> 232 across a 200-OK send; newest row status `logged_only`; non-console provider ids 0; wire04 1 -> 2
- status:    OPEN

## LV-023  HOP 0 GATE STATUS — one blocker left
- module:    accounting / dispatch (skeleton hop 7)
- entity:    TRANSP (where Hop 0 must run)
- observed:  Live-verified state of every blocker I filed against the money skeleton: **LV-011 send hangs — FIXED** (915 ms, 200). **LV-012 evidence counter silent — FIXED** (0 -> 1 -> 2, payload carries `reason:"no_source_load"`). **LV-010 email false-green — FIXED** (`logged_only`). **ACCT-F63 driver bill at customer rate — merged and deployed** (#4313), to be verified at Hop 0 against the real 48¢ card. **LV-013 — STILL OPEN.** Hop 0 preconditions otherwise confirmed: must run in **TRANSP** (USMCA copies of both named drivers are `status='Inactive'` and unassignable by the dispatch picker); GERARDO URBINA `e3cf9598-783e-43c0-b361-b229537daedc` and Fernando Mecor Hernandez `b7b22ff7-277c-4bb9-ab77-3ed52322327c` each carry a real **48¢/mi, `is_test_data=FALSE`, `miles_basis=short_miles`** rate, alongside a **120¢ `is_test_data=true`** decoy created 2026-08-04 that must NOT price the bill.
- recommendation:  hold Hop 0 until LV-013 closes. Hop 7 would otherwise mark a REAL customer invoice `sent` with no delivery artifact — manufacturing the exact false state Hop 0 exists to disprove. The remaining fix is narrow: enqueue on send, even as `logged_only`.
- severity:  minor (status record, not a defect)
- LANE:      n/a — gate status for the owner
## LV-026  The Accounting "Audit Trail" has no WORM backing — it is a live SELECT over the mutable ledger it is meant to corroborate
- module:    accounting
- entity:    TRANSP (table is entity-scoped; the gap is system-wide)
- surface:   `/accounting/audit-trail` — subtitle "Immutable posting events with tenant-scoped source lineage lookup"
- observed:  The page does not read an append-only audit stream. `apps/backend/src/accounting/audit-trail/service.ts` SELECTs `accounting.journal_entry_postings` joined to `journal_entries`/`posting_batches`/`catalogs.accounts`, and **synthesizes** the `event_class` label `accounting.posting_line_created` in TypeScript. Confirmed at the data layer: `audit.audit_events` holds **0** rows of class `accounting.posting_line_created` (2,225,899 events total, all other classes), and `audit.row_changes` holds **0** rows for `table_name='journal_entry_postings'`. So there is no independent record of a posting line's history — the "audit trail" *is* the ledger, re-labelled.
  **This is exposure, not tampering.** The ledger is currently honest and I verified it rather than assuming: `n_tup_upd=2`, `n_tup_del=0`, and those 2 updates are fully accounted for — `reversed_by_line_id` stamped on exactly 2 rows and `reversal_of_line_id` set on exactly 2 rows. That is the correct WORM-compatible reversal pattern, so I am explicitly **not** reporting the mutation as a defect. The finding is that nothing would record it if a posting were edited: the only two triggers on the table are `trg_check_journal_entry_balanced` (a balance constraint) and `trg_block_closed_period_journal_entry_postings` (a closed-period write block). Neither writes an audit row. The closed-period trigger is a real control, but it constrains **when** you may write, not **what** changed — and it leaves every OPEN period with no change record at all. A CPA, auditor or court reviewing this would find a report, not an audit trail: it cannot corroborate the ledger because it is derived from it.
- severity:  major (auditability/controls — not a live money error)
- LANE:      CC-1 (accounting/audit)
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. Completeness discriminator on `audit.audit_events`: visible 2,225,899 vs `n_live_tup` 2,226,247, `n_tup_del=0`. `accounting.journal_entry_postings`: 3,601 rows, ins 3,601, upd 2, del 0. Source lineage `source_transaction_type` populated 3,519/3,601 (97.7%) — the "—" rows visible in the UI are the 82-row manual-JE tail, **not** a systemic lineage gap, so that is explicitly not filed as a defect.
- status:    OPEN

## LV-027  36,468 scheduled-report failures ran unnoticed for 20 days — the bug is fixed, the blindness is not
- module:    accounting / reporting
- entity:    all three (TRANSP, USMCA, TRK)
- surface:   scheduled reports (`reports.scheduled.*` audit events)
- observed:  `audit.audit_events` carries **36,468** `reports.scheduled.failed` events between 2026-06-05 and 2026-06-25, from just **2** distinct report ids, running at roughly 1,000–1,900 failures/day (06-22: 1,920 · 06-21: 1,818 · 06-23: 990 · 06-24: 963 · 06-25: 621). Every sampled payload is the same root cause: `{"error":"column \"amount_received_cents\" does not exist","report_id":"cash-position-ar"}`, firing for all three operating companies.
  **I checked whether this is still broken before reporting it, and it is not.** The failures stop dead at 2026-06-25T16:10:32Z and `cash-position-ar` succeeded today: `reports.scheduled.sent` at 2026-08-04T17:47:26Z for TRANSP with `row_count 290`, `"AR open: 82986608c"` ($829,866.08). The scheduler is demonstrably alive, not silently dead. I am likewise **not** reporting the current `reports.scheduled.skipped / reason:"empty_data"` rows on TRK and USMCA as a defect — TRK holds assets and does not invoice, and USMCA is the test entity, so `row_count 0` is the correct outcome for both.
  What survives is the control gap: a money-facing report (AR/cash position) failed 36,468 times across every entity for 20 straight days and **nothing surfaced it** — no alert, no digest, no health signal. It was found only because I read the raw event table. Lifetime totals make the ratio plain: **112 `sent` vs 36,468 `failed`.** A failure class that can accumulate five figures in silence is indistinguishable from a feature that was never built.
- severity:  major (observability — a silent-failure class, per the standing "expected-state-recorded-as-failure" rule)
- LANE:      CC-1 (reporting/observability)
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement; counts and payloads read directly from `audit.audit_events`, daily histogram and newest-per-class confirmed.
- status:    OPEN

## LV-028  Detail type is stored twice in mutually-inconsistent conventions, the FK is 3.3% backfilled, and the obvious string backfill is provably unsafe
- module:    accounting
- entity:    all (catalog is universal; account instances are per-entity)
- surface:   `/accounting/account-type-catalog` + `catalogs.accounts`
- observed:  **The headline number is not the finding, and I corrected myself twice getting here.** I carried a note that `detail_type_id` was populated on only 48 of 1,441 accounts and expected to report missing detail types. Detail types are **not** missing: the canonical value lives in `catalogs.accounts.account_subtype`, populated on **1,435 of 1,441 (99.6%)** — only 6 accounts lack one (`13000-LEASE`, `42000-LEASE`, `42500-LEASE`, `79000-LEASE`, `6999`/`TRK-6999 Uncategorized Expenses`). The taxonomy page itself is correct and complete: 15 account types, 144 detail types, statement + normal balance, read-only as designed.
  The real problem is that the same fact is stored in **two representations with no mapping between them**. `account_subtype` holds the QBO API enum (`SalesOfProductIncome`); `catalogs.detail_types.name` holds the display form (`Sales of Product Income`); `detail_type_id` FKs to it on **48 of 1,441 (3.3%)**. Anything joining through `detail_type_id` therefore sees 3.3% of the chart of accounts — which is exactly how a report can look green while covering almost nothing.
  **I nearly filed a false conflict and the check is why I did not.** A naive lower/trim compare of the 48 rows that have both says only **7 of 48 agree**. That is an artifact of my own comparison: normalizing away punctuation and case, **48 of 48 agree — zero disagreements.** There is no data conflict between the two columns.
  **The load-bearing result is that the obvious fix is a trap.** The two conventions are mutually inconsistent about the ampersand, so no single normalization resolves them. `MachineryAndEquipment` ↔ "Machinery & Equipment" *spells* the `&` as "And"; `LegalProfessionalFees` ↔ "Legal & Professional Fees" *omits* it. I measured both directions: expanding `&`→"And" resolves Machinery (152 accounts, the largest single group) but leaves 19 subtypes / 102 accounts unresolved including the Legal, Dues, Supplies, Penalties, Repair and Shipping families; not expanding it resolves those but strands 13 subtypes / 216 accounts including all 152 Machinery rows. Further irregulars confirmed against the catalog: `AccountsReceivable` ↔ "Accounts Receivable (A/R)" (parenthetical), `Communications` ↔ "Communication" (plural), `FuelCosts` ↔ "Gas And Fuel" (different word entirely), `SuppliesMaterialsCogs` ↔ "Supplies & Materials - COGS", `ShippingFreightDeliveryCos` ↔ "Shipping, Freight & Delivery - COS".
  So a string-similarity backfill of `detail_type_id` would not merely miss rows — it would **silently mis-resolve fixed-asset and expense accounts into the wrong detail type**, which is a misstatement on the balance sheet and P&L presentation, not a cosmetic defect. This needs an explicit QBO-enum → detail-type alias map, not a normalization rule.
- severity:  major (correctness risk on backfill; today a coverage/joinability gap)
- LANE:      CC-1 (accounting/catalogs) — note `catalogs.*` is financial cluster, so this ships with the proof gate
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. `catalogs.accounts` 1,441 rows (`n_live_tup` 1,441, `n_tup_del` 0): `account_subtype` 1,435, `detail_type_id` 48. `catalogs.detail_types` 144 rows; FK `accounts_detail_type_id_fkey → catalogs.detail_types(id) ON DELETE SET NULL`. Of 48 both-set rows: 7 agree raw, **48 agree normalized**. Distinct subtypes in use 117; resolvable to catalog 104 by punctuation-normalization, with the residual measured both ways as above.
- status:    OPEN

## LV-029  Audit Trail's "Occurred" column shows row-creation time, not the accounting date — it can differ by months and makes correct books look altered
- module:    accounting
- entity:    TRANSP
- surface:   `/accounting/audit-trail` (column **Occurred**) vs `/accounting/account-register`
- observed:  I hit this as an apparent contradiction between two accounting surfaces and it resolved into a labelling defect, not a math defect. Account Register for **Fuel Expense** over 08/01–08/31/2026 reports **0 transactions, $0.00 debits, $0.00 credits**, while the Audit Trail displays Fuel Expense posting lines stamped **8/4/2026 1:27 AM**. Same account, same period, two different answers.
  **The register is right.** `accounting.journal_entry_postings` for Fuel Expense (`58c6e304-…`, acct 6100) holds 1,527 postings whose `entry_date` runs 2026-02-14 → **2026-07-29** — nothing in August — so "No transactions in this range" is correct. The register's arithmetic also ties out exactly: the net of all 1,527 postings is **57,880,720¢ = $578,807.20**, matching the rendered "Balance $578,807.20 Dr" and "Opening balance (Dr) $578,807.20" **to the penny** against an independent Neon sum. Recording that as a positive result for ACCT-SURF-06.
  The defect is the Audit Trail column header. `listAccountingAuditTrail` selects `COALESCE(je.created_at, pb.created_at, now()) AS occurred_at` — the row **creation** timestamp — and the UI labels that column **"Occurred"**. Those are routinely months apart because postings are backdated: journal entries created on 2026-08-04 carry `entry_date` values of 2026-07-02, 2026-07-11, 2026-06-24, 2026-06-02 and **2026-04-20**. Only 20 postings system-wide have an August-2026 `entry_date` at all.
  Why this matters beyond wording: on an audit surface, "Occurred" is read as *when the accounting event happened*. An auditor, CPA or examiner reconciling the Audit Trail against the Account Register sees activity dated 8/4 that the register says does not exist, and the natural inference is that the books were altered after the fact — the precise suspicion an audit trail exists to rule out. The honest fix is to label the column what it is (Recorded / Created) and, better, show `entry_date` alongside it, since the created-vs-effective gap *is* the audit-relevant fact. Note the `now()` fallback in that COALESCE will also stamp any batch-less, JE-less row with the current time.
- severity:  major (auditability — presentation, no money is misstated)
- LANE:      CC-1 (accounting/audit) — pairs with LV-026, same surface
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. Fuel Expense postings 1,527, `entry_date` 2026-02-14 → 2026-07-29, net 57,880,720¢. Postings with `entry_date` in Aug-2026: 20 system-wide. `created_at::date='2026-08-04'` rows carry entry_dates 2026-04-20 … 2026-07-16. Source: `apps/backend/src/accounting/audit-trail/service.ts`.
- status:    OPEN

## LV-024  The correct fix for LV-018 already ships two clicks away — All Transactions labels its aggregate "(page)"
- module:    accounting
- entity:    TRANSP
- surface:   `/accounting/all-transactions` (renders at `/accounting/transactions`) vs `/accounting/payments`
- observed:  All Transactions renders **22,728 transactions** with the header **"In (page): $27,221.96 · Out (page): $366,358.48"** — the scope qualifier **"(page)"** is stated explicitly, so the reader cannot mistake a page subtotal for a ledger total. **This is the exact pattern `/accounting/payments` is missing (LV-018)**, where an unqualified "Amount: $398,850.00" is in fact the sum of the 100 newest rows against a real ledger of $39,940,290.99.
- why this matters for the fix:  LV-018 is therefore **not** an unsolved design question or a missing capability — the honest pattern already exists in the same module, on a bigger surface, shipped. The fix is to apply the existing convention, not invent one. That makes it cheap, low-risk, and removes any argument about intent.
- surface verdict (ACCT-SURF-07):  **PASS.** 22,728 transactions across bank/fuel/invoice/bill/settlement in one register. Vendors resolve to real names — SOLO-TRUCKING INSURANCE, Premco Financial Corp Inc, Reliance Ins-First Insurance Funding, Ado Transportation Inc — with **no raw UUIDs**, further confirming LV-019's narrowing that the raw-key fallback is confined to the vendor path on bills / bill-payments. Type classified (`Bill (AP)`), Status honest (`unpaid`), In/Out correctly separated, and every row carries a working LINK -> Open reverse drill-through.
- severity:  minor (evidence that materially de-risks the LV-018 fix)
- LANE:      CLAUDE-CODER-1 (same owner as LV-018)
- neon-check: none — cross-surface render comparison; LV-018 carries the Neon arithmetic
- status:    OPEN

## LV-025  Unknown `/accounting/*` routes silently redirect to /home instead of surfacing a not-found
- module:    accounting
- entity:    TRANSP
- surface:   any unregistered `/accounting/<slug>` path
- observed:  Navigating to `/accounting/chart-of-accounts` (not a registered route) silently lands on **`/home`** with no message. The canonical routes are `/accounting/account-register`, `/accounting/account-type-catalog`, `/accounting/all-transactions`, etc. Low severity on its own, but worth recording because it makes route verification actively misleading: a mistyped or renamed money route renders a normal-looking dashboard rather than an error, so a link that has silently died looks like a working page. I hit this myself twice this session and had to check `manifest.tsx` to tell a broken route from a bad guess.
- severity:  minor
- LANE:      CURSOR (routing)
- neon-check: none
- status:    OPEN

## LV-035  Daily TMS↔QBO Reconciliation returns HTTP 500 and reports it to the user as "feature flag is off" — the flag is verifiably ON for that entity
- module:    accounting
- entity:    TRANSP (flag verified ON for all three)
- surface:   `/accounting/daily-recon` → `GET /api/v1/accounting/daily-recon`
- observed:  The page renders a calm, well-written empty state: **"TMS posting not enabled — nothing to reconcile yet. The GL_POSTING_ENABLED feature flag is off for this entity."** Both halves of that sentence are false, and the second is falsifiable directly.
  **1 — The endpoint is failing, not idle.** The live request the page issues returns **HTTP 500**: `GET https://api.ih35dispatch.com/api/v1/accounting/daily-recon?operating_company_id=91e0bf0a-133f-4ce8-a734-2586cfa66d96&from_date=2026-07-05&to_date=2026-08-04&match_status=all&limit=200` → **500**. Reproduced on a fresh page load with network capture armed. The user is shown "nothing to reconcile yet" for what is actually a server error.
  **2 — The flag is ON.** `lib.feature_flag_overrides` holds an override for `GL_POSTING_ENABLED` scoped to TRANSP (`548db070-4721-41c5-bf63-ead137b090f5`, `operating_company_id 91e0bf0a…`, `user_uuid NULL`, `enabled true`, `set_at 2026-07-26`, `expires_at NULL`). The same is true for USMCA and TRK, and for all 18 other `*_GL_POSTING_ENABLED` families — every posting flag is enabled on every entity.
  **3 — RLS masking is ruled out, which was the obvious suspect and would have been the wrong answer.** `lib.feature_flags` and `lib.feature_flag_overrides` are both RLS-enabled, and `feature_flag_overrides` is FORCE-RLS, so the natural hypothesis is that the runtime role cannot see the override. I tested it as the runtime actually runs — **no bypass**, `SET app.operating_company_id = '91e0bf0a…'`, as `ih35_app` — and reproduced `isEnabled`'s own two queries: the `lib.feature_flags` row for `GL_POSTING_ENABLED` is **visible (1)**, and the override under `isEnabled`'s exact predicate (`expires_at IS NULL OR > now()`, `user_uuid IS NULL AND operating_company_id = $3`) is **visible (1)**. RLS does filter this table in general (85 of 240 override rows visible to that role), but not the row that matters. `resolveFlagEnabled` returns the tenant override's `enabled` before ever reaching the per-entity kill-switch, so the resolver should return **true**.
  **What I could NOT determine, stated as such.** I could not identify the exact statement raising the 500 — that needs server logs, which I do not have. I did eliminate the cheap candidates: all relations resolve (`integrations.qbo_sync_queue`, `accounting.journal_entries`, `accounting.journal_entry_postings` all non-null via `to_regclass`), `payload_jsonb` exists, and the `jsonb_array_elements(q.payload_jsonb->'Line')` call at `daily-recon.routes.ts:178` is **not** the cause — all 8 TRANSP queue rows have `payload_jsonb IS NULL`, and `jsonb_array_elements` over NULL yields zero rows rather than throwing. **Root cause: UNVERIFIED — needs a server-log read.** I am not guessing at it.
  I also could not reconcile the rendered branch against local source: `DailyReconPage.tsx` checks `query.isError` *before* `!data?.gl_posting_active`, and `apiRequest` throws on `!response.ok`, so on a 500 the page should read "Failed to load reconciliation data." It does not. The most likely explanation is that the deployed bundle predates that ordering, but I did not confirm which build is live, so that too is **UNVERIFIED**.
  **Why this ranks high regardless of the root cause.** The twice-daily TMS↔QBO reconciliation is a CPA-locked control and the only surface that would reveal TMS GL drifting from QBO actuals. It is dark, and it is dark in the most dangerous way — not with an error banner, but with a reassuring sentence that attributes the silence to a deliberate configuration choice. Anyone checking whether reconciliation is running reads "posting not enabled", concludes the control is intentionally dormant, and moves on. Meanwhile TRANSP has 1,767 auto journal entries and 3,601 posting lines that this screen exists to reconcile. This is the same silent-failure family as LV-027 (36,468 unalerted report failures) and LV-010 (queue rows falsely claiming `sent`): the system's failures are being presented as normal states.
- severity:  critical (a money-reconciliation control is dark and misreports why; error masked as configuration)
- LANE:      CC-1 (accounting) — needs the server-log read to pin the 500, then the empty-state must distinguish "flag off" from "request failed"
- neon-check: prod `br-fancy-credit-akjnd07a`. Bypass reads as `ih35_app`: `lib.feature_flags.GL_POSTING_ENABLED` exists (`default_enabled false`, `rollout_pct 0.00`); 3 overrides all `enabled=true`, `expires_at NULL`. Runtime-simulation reads **without bypass** under `app.operating_company_id=91e0bf0a…`: flag row visible 1, matching override visible 1, 84 flags / 85 overrides visible overall. `integrations.qbo_sync_queue` TRANSP: 8 rows, all `payload_jsonb IS NULL`. HTTP 500 captured from the live page's own request.
- status:    OPEN

## LV-033  The append-only audit pattern LV-026 asks for is already built and correct one directory away — it guards the register holding $0.00 while the 3,601-line GL has none
- module:    accounting
- entity:    TRANSP (pattern is system-wide)
- surface:   `/accounting/opening-balance-register` vs `/accounting/audit-trail`
- observed:  LV-026 reported that the Accounting Audit Trail has no WORM backing. This finding closes the loop on it constructively: **the codebase already implements exactly the missing pattern, correctly, for a different money surface.**
  `accounting.ob_register_audit_events` — the table behind the Opening Balance Register's "Audit trail" panel — carries **both** layers of protection:
  - a trigger **`ob_register_audit_append_only`**, defined `BEFORE DELETE OR UPDATE ... FOR EACH ROW EXECUTE FUNCTION accounting.ob_register_audit_append_only_trigger()`, and
  - RLS policies for **INSERT (`polcmd='a'`) and SELECT (`polcmd='r'`) only — there is no UPDATE policy and no DELETE policy at all**, so even a caller that got past the trigger has no policy permitting the write.
  That is a textbook WORM implementation, and the page's claim — "Every import, edit, finality change, refused commit and commit is recorded and cannot be altered or deleted" — is therefore **truthful**, unlike the Audit Trail page's "Immutable posting events" (LV-026).
  **The asymmetry is the finding.** The protected table currently holds **0 rows** and guards a register whose totals read **$0.00 debits / $0.00 credits / $0.00 Opening Balance Equity**. Meanwhile `accounting.journal_entry_postings` — 3,601 lines, the entire live general ledger, every fuel/bank/bill/invoice posting in the business — has **no audit table, no append-only trigger, and no policy-level write restriction**, and (per LV-031) sits entirely in open periods so its closed-period trigger is inert. The strongest control in the accounting schema is pointed at the emptiest table; the ledger that matters has the weakest.
  This materially changes what LV-026 costs to fix. It is not "design and build an audit subsystem" — it is "apply `ob_register_audit_append_only_trigger`'s proven shape, plus the insert-and-select-only policy pair, to the posting table," with a working in-repo reference implementation to copy. Same argument structure as LV-024 for LV-018: the honest pattern already ships, it is simply not applied where it matters most.
  **Also recorded from this surface:** opening balances have never been entered. `ob_register_staging_lines`, `ob_register_audit_events` and `ob_source_finality` all show `n_tup_ins = 0` — never written — matching the page's "Nothing is staged. Import from QuickBooks or enter balances by hand first." and "No activity on this period yet." I am **not** filing that as a defect: opening balances are owner-entered only, the cloned QBO balances are on record as PROVISIONAL pending the embezzlement matter, and the page itself states the basis honestly ("Locked cutover basis (00_LOCKED_DECISIONS §8.9) — OB as-of 03/31/2026, cutover 04/01/2026 · balances are live and adjustable — no finality lock") and correctly labels the source-period cleanup note as "advisory only — does not block commit" per the 2026-07-29 owner ruling. I did not press "Commit opening balances", "Clone-as-is import + commit" or "Mark source final" — those write owner-only financial state.
- severity:  major (elevates LV-026 from a gap to an unapplied in-repo precedent; no money misstated)
- LANE:      CC-1 (accounting) — should be actioned together with LV-026 and LV-031
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. Trigger definition read from `pg_trigger`/`pg_get_triggerdef`; policies from `pg_policy` (`ob_register_audit_events_insert` cmd `a`, `ob_register_audit_events_select` cmd `r`, no update/delete policy). `ob_register_audit_events` / `ob_register_staging_lines` / `ob_source_finality` each `n_live_tup 0`, `n_tup_ins 0`, `n_tup_upd 0`, `n_tup_del 0`. Contrast measured in LV-026: `accounting.journal_entry_postings` 3,601 rows with only `trg_check_journal_entry_balanced` and `trg_block_closed_period_journal_entry_postings`, and 0 rows in `audit.row_changes`.
- status:    OPEN

## LV-031  No accounting period has ever been closed — the wizard is correctly refusing, but the consequence is that LV-026's only other control is inert across 100% of the ledger
- module:    accounting
- entity:    TRANSP + TRK + USMCA (all three)
- surface:   ACCT-SURF-08 — `/accounting/month-close` (Month close wizard) + `accounting.periods`
- observed:  `accounting.periods` holds **120 periods spanning 2024-01-01 → 2027-12-31** — 48 TRANSP, 48 TRK, 24 USMCA — and **every one has `status='open'` with `closed_at` NULL. Zero closed periods, in any entity, ever.** Consistently, 0 postings fall inside a closed period.
  **My first reading of this was wrong and the UI corrected it.** I initially took "no period ever closed" as an operational lapse. It is not: the Month close wizard is working exactly as designed and is actively refusing to close. For August 2026 it renders a real checklist with live counts — Bank reconciliation **Pending** (5 accounts still pending), A/R aging review **Pending** (290 overdue invoices), A/P aging review **Pending** (463 overdue bills), Fuel tax filing (IFTA) **Complete** (no filing due, 2026-Q3 in progress), Adjusting entries reviewed **Complete** (0 manual JEs in period) — reports "Period status: open", and the **Close month button is genuinely `disabled: true`** (read from the DOM, not inferred from styling; I did not click it, since that would close a real accounting period). It also surfaces the G11-10 note that overdue A/R or A/P may remain open with accountant sign-off. This is a correct, well-built gate and I am recording it as a PASS for SURF-08.
  A useful cross-confirmation fell out of it: the wizard's **290 overdue invoices** matches exactly the `row_count 290` returned by the `cash-position-ar` scheduled report in LV-027. Two independent surfaces agree on the same AR population.
  **What still matters is the consequence, and it is unchanged.** Because no period is closed, `trg_block_closed_period_journal_entry_postings` currently blocks nothing — its body resolves the JE's `operating_company_id` and `entry_date` and calls `accounting.raise_if_txn_in_closed_period(...)`, which cannot fire when no period is closed. Combined with LV-026 (`audit.row_changes` holds 0 rows for `journal_entry_postings`, and no trigger records a change), the two controls guarding the posting table reduce to exactly one that is effective today: the double-entry balance check. All 3,601 posting lines sit in open periods with no lock and no WORM copy. **This corrects LV-026, which credited the closed-period trigger as a real constraint — today it constrains nothing.**
  So the exposure is not caused by a broken close wizard; it is caused by the close preconditions never having been met (unreconciled bank accounts, 290 overdue invoices, 463 overdue bills). The remedy is operational — work the reconciliation and aging queues — and is an owner/CPA matter, not a coder's call. I am **not** proposing that anyone close a period; closing freezes prior-period figures and normally pairs with a retained-earnings entry. Note `locks_txn_dates_le`, `closed_by_user_id`, `closing_notes` and `retained_earnings_entry_id` all exist and are unused, so the mechanism is built and waiting.
- severity:  major (controls/auditability — compounds LV-026; no money is currently misstated, and the wizard itself is correct)
- LANE:      CC-1 (accounting) for the LV-026 control gap; actually closing periods is OWNER/CPA + operational queue work
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. `accounting.periods` 120 rows (`n_live_tup` 120, `n_tup_del` 0); status → `open` 120, `closed_at` non-null 0; per-entity 48/48/24 with closed=0 each. Postings joined to periods where `status='closed'` → 0. Trigger body read from `pg_proc`. Button state read from the live DOM: `{"text":"Close month","disabled":true}`.
- status:    OPEN

## LV-032  "Manual Journal Entries" shows 200 auto entries, zero manual ones, hides the only real manual entry, and reports a 200-row page cap as the total against a true 1,768
- module:    accounting
- entity:    TRANSP
- surface:   `/accounting/journal-entries` — H1 "Manual Journal Entries", subtitle "Filter, review, and void posted entries"
- observed:  Three separate defects converge on one page, all measured rather than eyeballed.
  **1 — The page contradicts its own title.** It renders 200 rows and **every one of the 200 has `Source = auto`. Not a single manual entry is shown.** Read from the live DOM: `{"h1":"Manual Journal Entries","rowCount":200,"sourceCounts":{"auto":200}}`. Whatever filter backs this page, it is not `source='manual'`.
  **2 — The one genuinely manual entry is missing from the page named after it.** TRANSP holds exactly **1** manual journal entry among 1,768 total (1,767 auto). It is not in the 200 rendered rows, because those are the newest 200 and the manual entry is older. So the single screen an accountant would open to review manual journal entries is the one place that entry cannot be found.
  **3 — A page cap is presented as a total.** The footer reads **"1–200 of 200"**. TRANSP actually has **1,768** journal entries. "of 200" is not a count of what exists; it is the cap restated as though it were the population. This is the same class as LV-018 (`/accounting/payments` showing an unqualified total that was really the sum of the newest 100 rows) and it has the same consequence: an auditor or owner asking "how many journal entries are on the books?" reads 200 and is wrong by a factor of nearly nine. LV-024 already established that this codebase ships the honest pattern elsewhere — All Transactions writes "In (page)" / "Out (page)" — so the fix is applying an existing in-repo convention, plus a genuine total from the server.
  **What is correct here, stated for balance.** Double-entry integrity is visibly intact: every rendered row has equal debits and credits ($5.00/$5.00, $30.00/$30.00, $15,000.00/$15,000.00, $1.00/$1.00). Void actions are present per row, consistent with void-not-delete. And two $15,000 reversals carry genuinely exemplary memos — "Reversing Event 1 (earn) for test load L-20260624-0083 … no delivery occurred. Revrec posted off load status with zero delivery evidence. **No POD exists and none will be fabricated.** Owner-authorized 2026-08-01." That is exactly the revenue-recognition-at-delivery discipline being enforced retroactively and documented for an auditor. The bookkeeping is honest; the presentation layer is what misreports.
  Cross-check that holds: the Month close wizard's "0 manual journal entries in period" for August 2026 is correct, since the single manual entry does not fall in that period.
- severity:  major (presentation misstates ledger population on a money surface; no money is misposted)
- LANE:      CC-1 (accounting) — pairs with LV-018 and LV-024, same aggregate-honesty class
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. `accounting.journal_entries` grouped by opco+source: TRANSP auto 1,767 / manual 1 (total 1,768); USMCA auto 12; TRK auto 5 / manual 1. Table `n_live_tup` 1,786, `n_tup_del` 0. Page state read from the live DOM as quoted above.
- status:    OPEN

## LV-030  Factoring/escrow GL cluster is structurally correct and entirely unposted — expected under parallel books, recorded so the zero is not later mistaken for a defect
- module:    accounting
- entity:    TRANSP + USMCA + TRK
- surface:   ACCT-SURF-09 — factoring / driver-escrow account cluster in `catalogs.accounts`
- observed:  **The locked accounting decisions hold structurally, verified account by account rather than assumed.** `2100 Driver Escrow - Held in Trust` is a **Liability** with subtype `Trust Accounts - Liabilities`, matching the locked "driver escrow = liability" decision. `2150 Factoring Advance` is a **Liability** (`OtherCurrentLiability`) and `QBO-1150040081 Faro Loan` is a **Liability** (`LoanPayable`), both matching the locked "factoring = secured borrowing / recourse, not a sale of receivables" treatment. `1210 A/R - Assigned to Faro` and `1220 Factoring Recoursed Invoices` remain **Assets** under A/R, which is what secured-borrowing treatment requires — the receivable stays on the balance sheet. No account in the cluster contradicts a locked decision.
  **What looked like duplicate accounts is correct per-entity instancing, and I checked before saying so.** Account numbers 1210, 1220, 1230, 2150 and 6820 each appear exactly twice — once under TRANSP (`91e0bf0a…`) and once under USMCA (`5c854333…`) — which is precisely the model the Account Type Catalog states ("account types are universal; account instances are per-entity"). Not filed as a defect.
  **Every account in the cluster has zero postings** — `2100`, `2150` (both entities), and all six Factoring Fees accounts (`6400`, `6820`×2, `QBO-113`, `QBO-1150040023`, `QBO-1150040090`, `QBO-1150040121`, `QBO-62`) each show 0 postings and 0 net. **I am explicitly not reporting this as a defect.** Money-posting flags default OFF until CPA + Neon tie-out, QBO is system-of-record under parallel double-books, and the `QBO-` prefixed accounts are imported history which is legitimately unposted. Recording it affirmatively so a later reader does not rediscover the zero and mistake it for a broken poster — and so that when factoring posting is switched on, this is the documented before-state.
  One genuine asymmetry worth noting, low severity: **USMCA carries two "Factoring Fees" accounts** — `6400` with subtype `Bank Charges` and `6820` with subtype `OtherExpense` — while TRANSP carries only `6820`. Identical account names with divergent P&L classification in the same chart means the same fee could land in Bank Charges or Other Expense depending on which is selected. Both are unposted, so this is a latent classification ambiguity rather than a live misstatement, and USMCA is the test entity, so an extra scratch account there is plausible. Flagging for a decision before factoring posting is enabled, not for a fix now.
  **The Escrow surface is correct and its emptiness is proven, not assumed.** `/accounting/escrow` renders "Escrow accounts and posting history" with Accounts / Pending Review tabs and cross-links to Settlements, Factoring and Banking · Driver Escrow (good reverse connectivity), and resolves to an honest **"No escrow accounts found."** — it does not hang on a spinner. That zero is complete: `accounting.escrow_accounts`, `accounting.escrow_postings`, `driver_finance.escrow_balances`, `escrow_ledger` and `escrow_deductions_pending` all show `n_live_tup = 0` **and `n_tup_ins = 0`** — never written, not merely emptied — while `driver_finance.escrow_settings` holds 2 rows and `catalogs.escrow_types` holds 3. The escrow programme is therefore configured but never started, exactly consistent with account `2100` carrying no postings. `n_tup_ins = 0` is the discriminator that turns this from an untrustworthy RLS zero into a verdict.
  **The Factoring surface matches the same pattern and is likewise correct.** `/accounting/factoring` ("Track factoring submissions, reserves, and releases") renders Batch # / Submitted / Factor / Invoices / Total / Advanced / Reserve / Status and reports "No factoring batches for selected filters." That is accurate: `accounting.factoring_advances`, `factoring_reserve_movements`, `factoring_default_interest_accruals`, `factoring_lifecycle_posting_keys`, `factor.faro_daily_imports`, `factor.faro_invoice_lines` and `factoring.customer_factor_assignment` all carry `n_tup_ins = 0` — never written — while `factoring.factor` and `factoring.canonical_factor_agreements` each hold exactly 1 row. Factoring is configured (one factor, one agreement) and never exercised, which is coherent with the zero postings on 1210/1220/1230/2150. I did **not** touch "+ Submit New Batch": submitting to Faro or any external factoring system is prohibited outright.
  **One item I am flagging rather than resolving, per the drift rule:** the factoring domain is spread across **three** schemas — `accounting.factoring_*`, `factor.*` (Faro imports) and `factoring.*` (factor, agreements, customer assignment) — plus six `views.factoring_*` views. I do not know which is canonical and I am deliberately not picking one; the LINKAGE LAW's RETIRE→canonical list does not name these. This needs an explicit canonical declaration before factoring posting is switched on, otherwise advances could be written to one representation while reserves are read from another. Naming the conflict, not choosing a winner.
  **Rule 19 observed:** the cluster also contains multiple reserve/holdback accounts (`1200 Factoring Reserve / Holdback`, `1230 Factoring Reserves`, `QBO-105`, `QBO-106`, `QBO-1150040080 Faro Factoring Reserves`). These are OWNER-MANUAL only. I am deliberately making **no** recommendation to merge, consolidate, reclassify or deactivate any of them, and no coder should — recording their existence only.
- severity:  minor (informational PASS + one latent classification ambiguity)
- LANE:      CC-1 (accounting/catalogs) — decision needed on the USMCA duplicate fee account before factoring posting is enabled
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. 38 accounts match escrow/factoring by name. Per-entity split confirmed by `operating_company_id` for 1210/1220/1230/2150/6820. Posting counts via LEFT JOIN `accounting.journal_entry_postings` — all zero across the cluster.
- status:    OPEN (informational)

## LV-034  Three different overdue counts across three surfaces are all correct — but the Home tile states neither its unit nor its 30-day threshold
- module:    accounting / home
- entity:    TRANSP
- surface:   `/home` Attention tile vs `/accounting/month-close` vs the `cash-position-ar` scheduled report
- observed:  Three surfaces report three different "overdue" numbers, and my first read was that they contradicted each other. **They do not.** Each measures a different thing, and I traced every one to its source rather than filing an inconsistency:
  - **290** — overdue *customer invoices*. Independently confirmed on **three** surfaces: the Month close wizard's "290 overdue invoice(s) — review required before close", the `cash-position-ar` scheduled report's `row_count 290` (LV-027), and a direct prod count (`due_date < current_date`, `amount_open_cents > 0`, not voided) = **290**. Three-way agreement on a money figure is a genuine PASS and worth recording as such.
  - **463** — overdue *vendor bills*, per the Month close wizard.
  - **277** — the Home Attention tile "Overdue bills and customers". This is neither documents nor the sum of the other two. Reading the source (`apps/backend/src/reports/library.routes.ts:440-476`), it is `count(*)` over `views.ap_aging` **plus** `views.ar_aging` where `bucket_31_60 + bucket_61_90 + bucket_91_plus > 0` — that is, **counterparties (vendors + customers) more than 30 days overdue**, deliberately excluding the 1–30 day bucket. Running that exact predicate on prod returns **150 AP + 128 AR = 278** against the 277 rendered, a one-row difference consistent with live movement between page render (19:50) and query (QBO sync last OK 19:45). The metric reconciles.
  **So the finding is not arithmetic, it is labelling.** The tile reads "Overdue bills and customers — Count 277" and conveys neither of the two facts needed to interpret it: that the unit is *counterparties*, not invoices or bills, and that it silently excludes anything overdue by 30 days or less. An owner glancing at Home sees "277 overdue" next to a system that elsewhere says 290 and 463, and has no way to reconcile the three without reading backend source — which is what it took here. It also merges payables and receivables into a single scalar, so the number cannot be acted on without opening another screen.
  This is the same honesty-of-aggregates family as LV-018 (unqualified page-scoped total), LV-024 (the "(page)" qualifier that already ships), LV-029 ("Occurred" meaning created-at) and LV-032 ("of 200" as a total). Individually each is minor; together they are a pattern — this system's arithmetic is consistently right and its labels are consistently under-specified. Worth fixing as one class rather than four tickets.
- severity:  minor (labelling; every underlying number verified correct)
- LANE:      CC-1 (reports/home) — bundle with the LV-018 / LV-024 / LV-029 / LV-032 labelling class
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. Overdue invoices 290 (distinct customers 130); overdue bills by my predicate 979 (distinct vendors 153) — note this differs from the wizard's 463 because the wizard applies its own review-required predicate, which I did not attempt to reproduce and am **not** reporting as a discrepancy. `views.ap_aging` >30d = 150, `views.ar_aging` >30d = 128, total 278 vs 277 rendered. Invoice status mix (TRANSP, not voided): paid 11,687 · sent 235 · partial 55 · draft 1.
- status:    OPEN

## LV-036  ROOT CAUSE — `/api/feature-flags/check` cannot see ANY per-entity override, so every per-entity-gated flag resolves false system-wide; the owner's 2026-07-26 enables have been invisible to the UI ever since
- module:    accounting / platform (feature flags)
- entity:    all three — the defect is entity-independent
- surface:   `GET /api/feature-flags/check` → `useFeatureFlag` → every flag-gated screen
- observed:  This is the root cause behind LV-035 and the QBO Reconcile screen, and it is systemic rather than per-page.
  **The symptom.** `/accounting/qbo-reconcile` renders "QBO reconcile captures are not yet enabled for this account. Enable the QBO_RECONCILE_UI_ENABLED feature flag to use this read-only module." That flag has `default_enabled = true` **and** an explicit per-entity override `enabled = true, expires_at NULL` for all three entities. The page's own request `GET /api/feature-flags/check?key=QBO_RECONCILE_UI_ENABLED&operating_company_id=91e0bf0a…` returns **HTTP 200** — the endpoint answers successfully and says `false`.
  **The mechanism, proven end to end.** The RLS policy `ff_overrides_select` on `lib.feature_flag_overrides` reads:
  `identity.is_lucia_bypass() OR (user_uuid IS NOT NULL) OR (operating_company_id IS NULL) OR (operating_company_id = (NULLIF(current_setting('app.operating_company_id', true), ''))::uuid)`
  A **tenant** override is exactly the row with `user_uuid IS NULL` and `operating_company_id NOT NULL`, so the only clause that can expose it is the last — it requires `app.operating_company_id` to be set. But the check route (`apps/backend/src/lib/feature-flags/routes.ts:63`) runs `isEnabled` inside `withCurrentUser(user.uuid, …)`, which establishes the *user* GUC and **not** `app.operating_company_id`, even though the caller passed `operating_company_id` as a query parameter. The GUC is empty, `NULLIF('','')` is NULL, the comparison yields NULL, and the row is filtered out.
  **Measured, not inferred.** As `ih35_app`, no bypass, with `app.operating_company_id` set to `''`: tenant overrides visible for `QBO_RECONCILE_UI_ENABLED` = **0**, for `GL_POSTING_ENABLED` = **0**, and for **every** tenant override in the table = **0 of 240**. Re-running the identical query with `app.operating_company_id = '91e0bf0a…'` returns **1**. The RLS predicate is the whole difference.
  **Why that lands on `false` and not on `default_enabled`.** With no override in hand, `resolveFlagEnabled` falls through to `if (isPerEntityGatedFlag(flag.flag_key)) return false;` (service.ts:289). `QBO_RECONCILE_UI_ENABLED` is listed in `PER_ENTITY_ONLY_FLAG_KEYS` at line 202, and every `*_GL_POSTING_ENABLED` key is a posting flag, so all of them short-circuit to `false` **before** `default_enabled` is ever consulted. That is why `QBO_RECONCILE_UI_ENABLED` reads disabled despite `default_enabled = true` — the per-entity kill-switch is doing exactly what it was designed to do, on evidence that RLS quietly removed.
  **Scope.** This affects every per-entity-gated flag resolved through this endpoint: all 18 `*_GL_POSTING_ENABLED` families across 3 entities (54 overrides), plus the per-entity-only UI flags — `QBO_RECONCILE_UI_ENABLED`, `FINANCE_HUB_UI_ENABLED`, `MY_ACCOUNTANT_ENABLED`, `RELAY_FUEL_INGEST_ENABLED` and anything matching `_PER_ENTITY_ONLY`. The owner set these overrides on **2026-07-26**; the UI has reported them off ever since.
  **The nuance that makes this coherent, and that I checked rather than assumed.** Posting itself clearly *is* running — TRANSP holds 1,767 auto journal entries and 3,601 posting lines. That is not a contradiction: backend posters run under contexts that do set the entity GUC (or under lucia bypass), so *they* see the override, while the flag-**check** endpoint does not. The books are being written; the screens that report whether the machinery is on are reading a false negative. That split is precisely why this went unnoticed — nothing broke, the dashboards simply said "off".
  **Relationship to LV-035:** this fully explains the daily-recon screen's "the GL_POSTING_ENABLED feature flag is off for this entity" message. It does **not** explain that endpoint's HTTP 500, which remains a separate, still-**UNVERIFIED** failure needing a server-log read. Two defects on one screen; do not let fixing this one hide that one.
- severity:  critical (systemic false-negative on every per-entity feature gate, including all money-posting flags)
- LANE:      CC-1 (platform/feature-flags) — the fix is to set `app.operating_company_id` for the requested entity in the check route's session (or resolve overrides under bypass), then re-verify every gated screen
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`. Policy text from `pg_policy`. Visibility with GUC empty: 0 / 0 / 0-of-240; with GUC set to TRANSP: 1. `QBO_RECONCILE_UI_ENABLED`: `default_enabled true`, 3 overrides `enabled true`, `expires_at NULL`. `GL_POSTING_ENABLED`: `default_enabled false`, 3 overrides `enabled true`, set_at 2026-07-26. Live HTTP 200 captured from the page's own `/api/feature-flags/check` request.
- status:    OPEN

## LV-041  Relay Card reports "No Relay fuel wallet is bound" while the exact binding it describes exists on prod — the module is dark for a wallet holding 1,656 transactions worth −$178,846.43
- module:    banking
- entity:    TRANSP
- surface:   `/banking/relay` (Relay Card tab)
- observed:  The Relay Card tab renders: **"No Relay fuel wallet is bound for this operating company."** It then states its own criterion precisely — *"Identity uses `catalogs.accounts.system_purpose = 'relay_fuel_wallet'` linked through `banking.bank_accounts.ledger_account_id`. An empty Relay tab here means no bank account tile carries that CoA bind for the selected company — not missing Plaid tags."*
  **Every condition in that sentence is satisfied on prod for the selected company.** `banking.bank_accounts` holds an **active** account named "Relay Fuel Wallet" for TRANSP whose `ledger_account_id` is `ee1e72a1-3310-46e6-ae1a-e0e60afe4354`; that `catalogs.accounts` row is account **1295 "Relay Fuel Wallet"** with **`system_purpose = 'relay_fuel_wallet'`** and **`operating_company_id = 91e0bf0a…` (TRANSP)**. The bind exists, is active, is same-entity, and carries the exact `system_purpose` the page names. Because the page publishes its own criterion, this is not a matter of interpretation — the message is falsifiable, and it is false.
  **The consequence is not cosmetic.** This is the wallet from LV-039: **1,656 transactions netting −$178,846.43**, the sole driver of Banking Home's "Cash posting −$174,129.05". So the module responsible for managing the Relay fuel wallet shows nothing at all, while that same wallet silently dominates a headline cash figure on the banking landing page. The one screen an operator would open to investigate the negative number is the one screen that denies the wallet exists.
  **I suspected LV-036 was the upstream cause and checked instead of assuming — it is not.** `RELAY_FUEL_INGEST_ENABLED` is in `PER_ENTITY_ONLY_FLAG_KEYS` with 3 enabled per-entity overrides, so under LV-036 it would resolve false, and a flag-gated tab would have explained this neatly. It is **not** flag-gated: the notice is rendered on the condition `relayWalletTiles.length === 0` (`BankingHome.tsx:887`), with no flag in the path. **LV-041 is therefore an independent defect, not a symptom of LV-036** — and the two must be fixed separately.
  **Where the failure actually is.** `relayWalletTiles` is derived as `sortedBankTiles.filter(t => t.is_relay_wallet === true || t.system_purpose === "relay_fuel_wallet")` (`BankingHome.tsx:200-203`). The criterion is applied not to the database but to the **bank tiles collection**, and Banking Home rendered only **three** tiles — …6103, …6129, …6137, all badged "real" — with the Relay Fuel Wallet absent from them entirely. So the wallet is either excluded from the tiles projection upstream (it is the only non-Plaid account, `plaid_item_id IS NULL`, and the rendered tiles are the Plaid-linked ones) or is returned without `is_relay_wallet` / `system_purpose` populated. **Which of those two applies is UNVERIFIED** — I could not capture the accounts API response body from the browser to settle it, and I am not guessing. What is certain is that the bind the message blames is correct in the database, so the fix belongs in the tile projection, not in the CoA data.
  Worth noting for whoever fixes it: USMCA has its own `relay_fuel_wallet` CoA row (`5585dc64…`, also account 1295), so per-entity instancing is correct here and is not the problem.
- severity:  major (a live wallet driving a headline KPI is unmanageable, and the screen's stated reason is provably wrong)
- LANE:      CC-1 (banking) — first determine whether the tab is gated by `RELAY_FUEL_INGEST_ENABLED` (LV-036) before touching the binding lookup, since the binding is already correct
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. `banking.bank_accounts` for TRANSP: "Relay Fuel Wallet" `ledger_account_id ee1e72a1…`, `is_active true`, `plaid_item_id IS NULL`. `catalogs.accounts ee1e72a1…` = 1295 / "Relay Fuel Wallet" / `system_purpose 'relay_fuel_wallet'` / opco 91e0bf0a…. Only two rows system-wide carry that `system_purpose` (TRANSP `ee1e72a1…`, USMCA `5585dc64…`). Wallet transaction total: 1,656 unvoided, −17,884,643¢ (LV-039).
- status:    OPEN

## LV-042  The silent unknown-route redirect (LV-025) is not confined to `/accounting/*` — `/banking/relay-card` also lands on `/home`
- module:    platform (routing)
- entity:    TRANSP
- surface:   any unregistered path under a module prefix
- observed:  LV-025 recorded that unregistered `/accounting/<slug>` paths silently redirect to `/home` with no message. That scope was too narrow: **`/banking/relay-card` also silently lands on `/home`**. The real route is **`/banking/relay`** (read from the tab's own `href`), and `/banking/finance-hub`-style guesses behave the same way — earlier `/accounting/finance-hub` and `/accounting/ar-aging` both did it too.
  This is worth widening rather than leaving as an accounting-only note because of how it fails: a wrong or renamed money route does not error, it renders a normal-looking dashboard. During this sweep it cost me real time twice and, more importantly, it means a dead link anywhere in the product is indistinguishable from a working one. The correct verification habit — which I adopted after the second occurrence — is to read routes from the live DOM (`a[href]`) or the route manifest rather than constructing them, and I would recommend the same to anyone auditing these modules.
- severity:  minor (but it actively degrades verifiability across every module)
- LANE:      CURSOR (routing)
- neon-check: none — routing behaviour observed live on the deployed build.
- status:    OPEN

## LV-039  Banking Home's "Cash posting" reads −$174,129.05 against $4,717.38 of real bank cash — the arithmetic is right, the code's own stated invariant is false, and the Relay wallet's stored balance contradicts its own transactions
- module:    banking
- entity:    TRANSP
- surface:   `/banking` (Banking Home) — "Cash posting" KPI vs the bank-account tiles
- observed:  Banking Home renders **CASH POSTING −$174,129.05** directly beside three bank tiles that sum to **+$4,717.38** (BUSINESS CHECKING …6103 $3,834.49 + …6129 $346.11 + …6137 $536.78). Home's own Cash Position tile independently reads **$4,717**. Two headline "cash" figures on two pages differ by **$178,846.43**.
  **The KPI is not miscalculating — I reproduced it exactly.** `sumAuthoritativeDepositoryCashCents` is `plaid_part + internal_part`. On prod for TRANSP: plaid_part = **471,738¢** (3 depository accounts with `plaid_item_id IS NOT NULL`) and internal_part = **−17,884,643¢** (non-Plaid depository accounts, summing `banking.bank_transactions` signed by `is_credit`). 471,738 − 17,884,643 = **−17,412,905¢ = −$174,129.05**, matching the rendered KPI to the cent. The whole of the internal part is one account: **Relay Fuel Wallet, 1,656 transactions**.
  **The defect is that the KPI and the tiles are structurally different populations, while the code asserts they are the same.** `BankingHome.tsx:150` states: *"BANK-F01 / AUDIT row 2 — Cash posting KPI must match the per-account tile sum in dollars."* That invariant cannot hold on prod: the tiles render only Plaid-linked accounts, whereas the KPI additionally folds in a non-Plaid wallet's transaction-derived balance. A unit test asserts the same invariant (`BankingHome.test.tsx:103`), so it is presumably green against fixture data where the wallet is empty — the assertion passes in CI while production violates it by $178,846.43. That is the "green test, wrong in prod" shape, and it is why the number has stood.
  **A second, independent inconsistency inside one account.** Relay Fuel Wallet's **stored `current_balance_cents` is 0**, while its own 1,656 unvoided transactions net to **−17,884,643¢**. One account is simultaneously reporting a zero balance and a −$178,846.43 transaction history, and which of the two a screen shows depends purely on which field it happens to read. The wallet is not even rendered as a tile, so the −$178k is invisible on the page that is nonetheless reporting it in the KPI.
  **Likely cause, explicitly NOT asserted.** A prepaid fuel wallet whose purchases are recorded as debits while its funding deposits are absent or classified elsewhere would net exactly this way, and there is a standing open item about Relay deposit funding classification (personal-card deposits). That is a plausible explanation and I did **not** verify it — determining whether the funding side is missing, misclassified, or intentionally excluded requires tracing Relay deposits, which I have not done. **UNVERIFIED — needs a funding-side trace.** I am reporting the contradiction, not its cause.
  **Why this matters.** "Cash posting" is a headline figure on the banking landing page. As rendered it tells an owner, a lender or a CPA that the operating cash position is **negative $174 thousand**, when the bank accounts hold **positive $4,717.38** and the company's own Home screen says so. Whichever figure is intended, the two cannot both be labelled cash, and the pairing of a large negative with an adjacent set of positive tiles is exactly the presentation that gets acted on incorrectly. This is the same aggregate-honesty class as LV-018 / LV-024 / LV-029 / LV-032 / LV-034, but with a materially larger number attached.
- severity:  major (headline cash figure contradicts actual bank cash by $178,846.43; no posting is wrong)
- LANE:      CC-1 (banking) — decide whether the KPI is bank cash (exclude the wallet, matching the tiles and the stated invariant) or total internal liquidity (then label it so and tile the wallet); separately reconcile the wallet's stored balance against its transactions
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. plaid_part 471,738¢ over 3 accounts; internal_part −17,884,643¢ over 1,656 txns; sum −17,412,905¢ = the rendered −$174,129.05. Relay Fuel Wallet: `current_balance_cents` 0, txn-derived −17,884,643¢, 1,656 unvoided txns, `plaid_item_id IS NULL`. Depository accounts for TRANSP: …6103 383,449¢, …6137 53,678¢, …6129 34,611¢, Relay Fuel Wallet 0¢ (active), BUSINESS CHECKING …3500 −7,399¢ (inactive, correctly excluded).
- status:    OPEN

## LV-040  Bank Reconciliation shows 0 of 199 July transactions yet leaves "Close period" enabled — a period could be attested as reconciled having reconciled nothing
- module:    banking
- entity:    TRANSP
- surface:   `/banking/reconciliation`
- observed:  I exercised the screen end to end rather than reading its empty state: selected **BUSINESS CHECKING …6103**, set **07/01/2026 → 07/31/2026**, and waited for it to settle. Result: **Beginning balance $0.00, Ending balance $0.00, Last reconciled —, Progress 0% (0/0)**, and a **"Bank transactions worklist" containing no transactions** — only a STATEMENT UPLOAD (CSV) panel.
  That account has **199 transactions dated in July 2026** (1,287 unvoided in total, spanning 2026-02-17 → 2026-08-03). The screen surfaced none of them.
  **The control has never run anywhere.** Across all six TRANSP bank accounts — Relay Fuel Wallet 1,656, …6103 1,287, …6137 1,214, …6129 931, Business Platinum Card® 858, …3500 59 — `reconciliation_cleared` is **0 on every single transaction**. Nothing has ever been marked cleared, which is consistent with Banking Home's "Last reconciled: —", the Month close wizard's "Bank reconciliation Pending — 5 accounts still pending" (the picker lists exactly those 5 reconcilable accounts, confirming that count), and LV-031's finding that no accounting period has ever been closed.
  **The part that is a genuine control weakness, independent of the above.** With the worklist empty, progress reading **0/0**, and both balances **$0.00**, the **"Close period" action is enabled** — it becomes active as soon as an account and date range are chosen. So an operator can close a reconciliation period for an account holding 199 unreconciled transactions, having cleared none of them, and the system will record that period as reconciled. That is a false attestation available in one click, and it is precisely the opposite of the Month close wizard's behaviour, which correctly renders **Close month `disabled: true`** while its checks are pending (LV-031). The same product enforces the gate in one place and omits it in the other. **I did not click it** — closing a reconciliation period is a real financial state change and is not mine to make.
  **The alternative explanation, stated rather than assumed away.** The worklist panel offers a statement CSV upload ("Expected columns: date, description, amount"), so the intended flow may be statement-driven: upload a bank statement, then match its lines against bank transactions, in which case an empty worklist before any upload could be by design. I did **not** upload a statement, so whether the worklist is empty by design or by defect is **UNVERIFIED**. The page's own subtitle — "Review unmatched transactions, accept/reject auto matches, and close reconciled periods" — reads as though existing unmatched transactions should appear, and 199 exist, but I am not treating the subtitle as proof of intent.
  **The "Close period" weakness stands regardless of which reading is right.** Whether the worklist is empty by design or by defect, a period must not be closable when zero transactions have been cleared and the reconciled balances are $0.00 against a live account balance of $3,834.49.
- severity:  major (a reconciliation period can be attested with nothing reconciled; the control has never been exercised)
- LANE:      CC-1 (banking) — gate "Close period" on cleared-count and a balance match, mirroring the Month close wizard; separately confirm whether the worklist is statement-gated and say so on screen if it is
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. …6103 July-2026 transactions (`transaction_date` between 07-01 and 07-31, not voided) = **199**; total unvoided per account as listed above; `reconciliation_cleared` true = **0** on all 6,005 TRANSP bank transactions. Live UI state read after selecting account + range. Account picker lists 5 reconcilable accounts, matching the Month close wizard's "5 accounts still pending".
- status:    OPEN

## LV-038  `cash_clearing` and `undeposited_funds` resolve to the SAME account on TRANSP and USMCA, so vendor disbursements are credited to Undeposited Funds and the operating bank is never touched — TRK proves the model supports separating them
- module:    accounting
- entity:    TRANSP + USMCA (TRK is bound correctly and is the control)
- surface:   `/accounting/undeposited-funds` (routes to the Account Register for that account) · `accounting.chart_of_accounts_roles`
- observed:  Undeposited Funds for TRANSP holds exactly 2 postings, both dated 08/03/2026, both $5.00, netting to $0.00:
  - `customer_payment` PMT-2026-00712 — **Dr Undeposited Funds $5.00 / Cr A/R (QBO-45) $5.00**. This is textbook-correct: a customer receipt lands in Undeposited Funds pending deposit.
  - `bill_payment` 402b2bb3 — **Dr A/P (QBO-47) $5.00 / Cr Undeposited Funds $5.00**, and the credit line's own description is **"…cash"**. A vendor disbursement is being credited to Undeposited Funds.
  **The poster is not the defect — the role binding is, and I checked before blaming code.** `posting-engine.service.ts:438` documents a deliberate "fail soft to undeposited_funds / cash_clearing so historical rows can still post", so my first hypothesis was that the bank role was unmapped and the poster fell back. That is **wrong**: `accounting.chart_of_accounts_roles` holds 131 rows with **0 unbound** (this also corrects a standing note that 3 roles were still unbound on prod — they are not). The poster resolved its cash role exactly as configured. The configuration is what is off:
  - **TRANSP**: `cash_clearing` → account `3d580499…` (QBO-168 Undeposited Funds) and `undeposited_funds` → **the same account id `3d580499…`**.
  - **USMCA**: `cash_clearing` and `undeposited_funds` both → `09d53946…` (1090 Undeposited Funds). Same collapse.
  - **TRK**: `cash_clearing` → `832dea8c…` (QBO-168) but `undeposited_funds` → `bd972c3c…` (TRK-QBO-168) — **two distinct accounts**. TRK is the control case showing the data model fully supports keeping these separate, so this is a binding choice, not a schema limitation.
  Meanwhile `cash_dip` — the real operating bank — is correctly bound on all three (TRANSP → QBO-1150040141 WF General Operating 6103; USMCA → 1000 Bank of America Operating; TRK → 1000 Business Checking …3500) and is untouched by either posting.
  **Why this matters at volume, and why it is not yet material.** Undeposited Funds has one meaning in QBO and in practice: customer receipts received but not yet deposited. Routing AP disbursements through the same account means receipts and disbursements net against each other inside it, so its balance stops representing anything reconcilable — it is neither "money waiting to be deposited" nor a bank balance. The operating bank ledger never records the AP payment, so the bank register and the real bank statement diverge permanently, and bank reconciliation cannot tie. That is consistent with what the rest of the system already reports: Home shows "Last reconciled: —" and the Month close wizard shows "Bank reconciliation Pending — 5 accounts still pending" (LV-031). Today the exposure is **$0.00 net across 2 proof postings**, so nothing is misstated yet; the concern is entirely forward-looking, before real AP volume flows.
  **Cross-entity leak explicitly ruled out.** The repeated account number `QBO-168` across TRANSP and TRK looked like one entity's role pointing at another's account. It is not: **0 active role bindings are cross-entity**, and TRK's QBO-168 (`832dea8c…`) carries `operating_company_id = b49a737b…`, its own. Account numbers are reused per entity by design (LV-030). Not filed.
- severity:  major (forward-looking correctness of the AP cash side + bank reconcilability; $0.00 impact today)
- LANE:      CC-1 (accounting) — decide whether `cash_clearing` should point at a distinct AP disbursement clearing account or directly at `cash_dip`, then re-verify; note reserve-style accounts stay owner-manual under Rule 19
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. `accounting.chart_of_accounts_roles` 131 rows, `n_tup_ins` 131, unbound 0. Active `cash_clearing`/`undeposited_funds`/`cash_dip`/`ap_control` bindings enumerated per entity with account ids and `account.operating_company_id` compared to the role's — `same_entity` true for every row; cross-entity active bindings = **0**. Undeposited Funds (`3d580499…`) total postings = 2. Note `catalogs.account_role_bindings` is an empty, never-written table (0 rows, `n_tup_ins` 0) — I read it first and it is **not** the live role table; the live one is `accounting.chart_of_accounts_roles`.
- status:    OPEN

## LV-037  LV-036 quantified: 221 enabled per-entity overrides across 74 flags are unreadable, and a second screen (My Accountant) is confirmed reporting a false negative
- module:    accounting / platform (feature flags)
- entity:    all three
- surface:   `/accounting/my-accountant` + the whole `/api/feature-flags/check` consumer set
- observed:  LV-036 established the mechanism. This measures how far it reaches and confirms it is not a one-screen anomaly.
  **Second confirmed instance.** `/accounting/my-accountant` renders "The accountant workspace is not yet enabled for this account. Enable the MY_ACCOUNTANT_ENABLED feature flag to use this module." `MY_ACCOUNTANT_ENABLED` has **3 enabled per-entity overrides** (one per operating company, `enabled = true`, unexpired). The screen is instructing the owner to enable a flag he already enabled. Same shape as QBO Reconcile in LV-036, different flag and different page — so the defect is in the shared resolution path, exactly as LV-036 argues, and not in either page.
  **Blast radius, measured.** Across `lib.feature_flag_overrides`: **221 enabled, unexpired per-entity override rows spanning 74 distinct flag keys**. Every one of them is invisible to `/api/feature-flags/check`, because that endpoint never sets `app.operating_company_id` and the `ff_overrides_select` policy exposes a tenant override through no other clause (LV-036: 0 of 240 visible with the GUC empty, 1 with it set).
  **What that actually means per flag, stated precisely rather than as a blanket claim.** The consequence is not uniform, and it would be wrong to say all 74 flags read false:
  - For **per-entity-gated** keys — every `*_GL_POSTING_ENABLED` family plus the per-entity-only set — `resolveFlagEnabled` short-circuits to `false` before `default_enabled` is consulted, so the answer is a hard, unconditional **false**. Confirmed on four: `QBO_RECONCILE_UI_ENABLED` (3 overrides, `default_enabled true`), `FINANCE_HUB_UI_ENABLED` (3, `true`), `MY_ACCOUNTANT_ENABLED` (3, `false`), `RELAY_FUEL_INGEST_ENABLED` (3, `false`).
  - For **non-gated** keys, resolution falls through to `default_enabled`. The override is still unread, so the entity-specific intent is silently discarded — the answer happens to be right only when `default_enabled` coincides with what the override said. A per-entity **disable** on a globally-enabled flag would be ignored outright, which is the more dangerous direction and is worth checking during the fix.
  Note the two `default_enabled = true` cases above are the clearest proof that the kill-switch is firing on missing evidence rather than on intent: those flags are on globally *and* on per-entity, and still resolve false.
  **Why the owner would not have caught this.** The overrides were set 2026-07-26 and are present and correct in the table; an owner or admin inspecting flag state through the admin listing (`/api/feature-flags`, which uses `listOverrides` under an Owner-gated bypass) sees them enabled. Only the per-request `check` path is blind. So the configuration screen and the feature screens disagree, and each is internally consistent.
- severity:  critical (quantifies LV-036; 221 enabled per-entity overrides unreadable, second screen confirmed)
- LANE:      CC-1 (platform/feature-flags) — fix with LV-036; re-verify each gated screen after, and explicitly test a per-entity **disable** on a globally-enabled flag
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. Enabled unexpired tenant overrides: **221 rows across 74 distinct flag_keys**. Per-flag enabled tenant override counts: `MY_ACCOUNTANT_ENABLED` 3 (`default_enabled false`), `FINANCE_HUB_UI_ENABLED` 3 (`true`), `QBO_RECONCILE_UI_ENABLED` 3 (`true`), `RELAY_FUEL_INGEST_ENABLED` 3 (`false`). Live render of `/accounting/my-accountant` captured.
- status:    OPEN

## LV-043  CLS-UNIT-SCALE's banking instance is DRAINED — verified live and by guard; the card is stale-open and names a guard file that does not exist, so BANK-CLS-SHARED is blocked by an already-fixed class
- module:    banking (BANK-CLS-SHARED / CLS-UNIT-SCALE)
- entity:    TRANSP (USMCA cited as the card's own positive control)
- surface:   Banking Home "Cash posting" KPI · `apps/backend/src/banking/banking.routes.ts`
- observed:  `BANK-CLS-SHARED` is OPEN because four `CLS-*` cards list banking in `modules[]`. One of them, **CLS-UNIT-SCALE**, is drained in banking and the card has not caught up.
  **What the card claims.** Root cause: "a cents integer is exposed as a dollar field … causing 100x display errors. **3 surfaces in banking**", instances `banking.routes.ts:184` (UNIT-001, Banking Home KPI), `:308` (UNIT-002, factoring virtual register), `:426` (UNIT-003, categorize). Drain proof: *"Banking Home KPI TRANSP: displayed $9,368.00, correct = $93.68 (100x)."* `guard_green: false`.
  **What is true on the deployed build and on main today — three independent lines of evidence:**
  1. **Live.** Banking Home renders Cash posting **−$174,129.05**. I reproduced that from prod to the cent: plaid part **471,738¢** + internal part **−17,884,643¢** = **−17,412,905¢**, i.e. exactly cents ÷ 100. A 100× scale fault would render −$17,412,905 or −$1,741.29; it renders neither. There is no scale error on this KPI.
  2. **Code.** All three cited line numbers are stale — `banking.routes.ts:184` is now a KPI default object, `:308` an update loop, `:426` a validation block. Searching the whole file for the pattern (`formatUsd(... _cents)` / `_cents ... toFixed(2)`) returns **no matches**, so the defect is absent from the file the card names, not merely moved.
  3. **Guards.** `scripts/verify-banking-cash-kpi-cents-unit.mjs` (step 1973) → **exit 0**, "Cash KPI uses API dollars once (no frontend /100 after backend /100)". `scripts/verify-banking-cash-posting-cents-scale.mjs` (step 2282) → **exit 0**, "Cash posting KPI uses API dollars once (matches Cash Flow authoritative cents / 100)". Both were written for exactly this defect and both pass.
  **A second, separate defect in the card itself.** Its `guard` field names **`scripts/verify-cents-dollar-scale.mjs`, which does not exist** — I checked the directory. So the card's `guard_green: false` is not evidence that the class is still live; it is what a missing file produces. A class card whose drain can only ever be proven by a non-existent guard cannot be drained by its own criteria, and its `guard_green: false` will read as "still broken" indefinitely. The two guards that *do* cover this defect are not referenced by the card.
  **Honest scope limit.** UNIT-001 (the Banking Home KPI) is drained on all three lines of evidence including live render. UNIT-002 (factoring virtual register) and UNIT-003 (categorize) are drained on **code and guard evidence only** — the pattern is absent from the file and both guards pass — but I could **not** confirm them on live values, because the factoring virtual-bank card reads **$0.00** across the board (reserves, advances, chargebacks) and **a zero cannot demonstrate the absence of a 100× error**. Marking those two **PASS (code+guard), UNVERIFIED (live)** rather than claiming a live proof I do not have. They will only be live-provable once factoring carries non-zero values.
  **Consequence.** Banking module completion is currently gated on a class whose banking surfaces are fixed. Draining CLS-UNIT-SCALE for banking — and repointing its `guard` field at the two real guards — removes one of the four blockers on BANK-CLS-SHARED without any code change.
- severity:  major (a fixed class is holding a module open; plus a card citing a non-existent guard)
- LANE:      route to whoever owns `docs/audit/wave-queue.json` (Cascade — I do not edit that file). No product-code change required.
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement — plaid_part 471,738¢ (3 depository accounts, `plaid_item_id IS NOT NULL`), internal_part −17,884,643¢ (Relay Fuel Wallet, 1,656 unvoided txns), sum −17,412,905¢ = rendered −$174,129.05. Guards run on main at `6901cf9e0`: 1973 exit 0, 2282 exit 0. `scripts/verify-cents-dollar-scale.mjs` absent from `scripts/`.
- status:    OPEN (recommendation: drain CLS-UNIT-SCALE for banking; fix the card's guard reference)

## LV-044  All four CLS-* cards gating BANK-CLS-SHARED name guard scripts that do not exist — their `guard_green: false` is a missing file, not evidence of a live defect, so banking cannot be drained by its own stated criteria
- module:    banking (BANK-CLS-SHARED) — class cards also list accounting, fuel, fleet, legal, drivers, factoring
- entity:    ALL
- surface:   `docs/audit/wave-queue.json` CLS-* cards vs `scripts/`
- observed:  `BANK-CLS-SHARED` is OPEN with the acceptance "4 open CLS-* cards … drained", and banking module completion cannot be true while they stand. **Every one of the four names a `guard` script that is absent from the repository:**
  | card | `guard` field | file exists? |
  |---|---|---|
  | CLS-LINKAGE-ONEWAY | `scripts/verify-money-ops-fk-density.mjs` | **NO** |
  | CLS-BANK-MATCH-DENSITY | `scripts/verify-silent-success-posting-output.mjs` | **NO** |
  | CLS-UNIT-SCALE | `scripts/verify-cents-dollar-scale.mjs` | **NO** |
  | CLS-SILENT-CAP | `scripts/verify-no-silent-list-cap.mjs` | **NO** |
  Each card also carries `drain_proof.guard_green: false`. That flag is therefore **not evidence that the class is still live** — it is the unavoidable output of a guard that cannot run. A class whose only stated drain-proof is a non-existent file can never be drained on its own criteria, and will read as permanently open. Because BANK-CLS-SHARED's acceptance is defined as those four draining, **banking module completion is gated on a condition that cannot currently be satisfied by the mechanism the cards specify.**
  **This is not the same as "these classes have no coverage" — I checked before making the stronger claim.** Related guards exist under different names, but none is the class-level guard a card points at, and **no card references any of them**:
  - silent-cap: `verify-coa-list-total-pagination`, `verify-equipment-list-total-pagination`, `verify-mdata-list-pagination`, `verify-audit-fix-13-customers-pagination-works` — per-list, not the cross-module class.
  - linkage: `verify-banking-by-linkage-reverse`, `verify-acct-receipts-reverse-linkage`, `verify-banking-escrow-settlement-linkage`, `verify-94-live-counter-linkage` — per-surface, not FK-density.
  - silent-success: only `verify-saf-f35-spawn-liability-no-silent-success` (safety-specific), not the money/posting class.
  - unit-scale: `verify-banking-cash-kpi-cents-unit` (step 1973) and `verify-banking-cash-posting-cents-scale` (step 2282) both exist and both **pass** — which is exactly how I established in LV-043 that CLS-UNIT-SCALE's banking instance is already drained while its card still reads open.
  So the coverage gap is uneven: CLS-UNIT-SCALE has real, passing guards that its card does not cite; the other three have only partial per-surface coverage and no class-level guard at all.
  **Why this matters beyond bookkeeping.** LV-043 shows the failure mode concretely: a class that is genuinely fixed in banking stayed open, holding a module, because the card's evidence was stale and its guard could not run to contradict it. The same mechanism will hide the reverse — a class that is genuinely broken will also show `guard_green: false`, indistinguishable from the fixed case. **The flag carries no information in either direction.** Any decision to declare banking complete, or to keep it open, is currently being made on a signal that is constant by construction.
- severity:  major (module-completion gating runs on a signal that cannot discriminate; blocks BANK-CLS-SHARED indefinitely)
- LANE:      route to whoever owns `docs/audit/wave-queue.json` (Cascade) for the card fields; guard authorship to CC-1 (money classes) / Cursor (FE list-cap). **I edit neither file.**
- neon-check: none required — verified against the repository at main `6901cf9e0`: each named guard path checked for existence individually, and the two existing unit-scale guards executed (exit 0 each). Card fields read from `docs/audit/wave-queue.json`.
- status:    OPEN

## LV-045  CLS-SILENT-CAP's banking instance is stale — the cited 1000/5000 caps are gone and the transaction list is paginated; what remains is two uncapped reference dropdowns sitting 10 rows from silent truncation
- module:    banking (BANK-CLS-SHARED / CLS-SILENT-CAP)
- entity:    TRANSP
- surface:   `apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx`
- observed:  The card's banking instance reads: *"BankingTransactionsDesignView.tsx lines ~380,390: `limit: 1000` / `limit: 5000`"*, with the class root cause "list query ships a hard LIMIT with no pagination, silently truncating results".
  **Those two caps no longer exist.** Searching every `limit` in the file today returns: line 358 `limit: COMPANY_TRANSACTIONS_PAGE_SIZE` (the main bank-transaction list — a named page-size constant, i.e. genuinely paginated, not a silent cap), lines 424/435 `limit: PICKER_PAGE` (named constant), lines 445/456 `limit: 200, offset: 0`, and line 1847 `limit={200}` as a prop. No 1000, no 5000. The instance as written is **drained**.
  **What actually remains is narrower and worth keeping open.** Lines 445 and 456 load two reference catalogs for the inline categorization dropdowns — `itemsCatalogClient.list(… limit: 200, offset: 0)` and `classesCatalogClient.list(… limit: 200, offset: 0)` — each a single fixed-size fetch with no pagination and no total count. These match the class pattern exactly: a full-looking dropdown that is missing rows once the catalog exceeds 200.
  **Live measurement decides the severity, and it is "not yet, but close".** On prod: `catalogs.items` for TRANSP = **190** (241 across all entities), `catalogs.classes` for TRANSP = **177**. Both are **below** the 200 cap, so **nothing is being truncated today** — I am recording this as PASS-with-risk, not as a live defect, because claiming truncation here would be false. But items sits **10 rows** from the cap. The moment a TRANSP user creates an eleventh item, the categorization dropdown silently stops showing some of them, on the surface where bank transactions are assigned to items — so the failure mode is a user unable to find the correct item and plausibly selecting a wrong one, on money coding, with no indication anything was omitted.
  Both catalogs also offer inline "+ Add new" creation (per §7), which is precisely the mechanism that will push items past 200 in ordinary use.
- severity:  minor today (nothing truncated), major on crossing 200 — items is 10 rows away
- LANE:      CURSOR (FE) — give these two dropdowns the same paginated/typeahead treatment the main list already has, or surface a total-count indicator
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=neondb_owner` (role alternates), bypass its own statement. `catalogs.items` TRANSP 190 / all 241 (`n_live_tup` 241, `n_tup_del` 0); `catalogs.classes` TRANSP 177 / all 177 (`n_live_tup` 177, `n_tup_del` 0) — counts complete against live tuples. Source read at main `6901cf9e0`.
- status:    OPEN (card instance text is stale and should be repointed to lines 445/456 with the 200 cap)

## LV-046  CLS-LINKAGE-ONEWAY (LINK-006) and CLS-BANK-MATCH-DENSITY (SS-003) are CONFIRMED still open — and both are downstream of one operational fact: bank reconciliation has never been run
- module:    banking (BANK-CLS-SHARED)
- entity:    ALL
- surface:   `banking.bank_transactions`
- observed:  Unlike CLS-UNIT-SCALE (LV-043, drained) and CLS-SILENT-CAP (LV-045, stale text), these two cards are **accurate and still live**. Measured on prod, unvoided, all entities:
  | column | populated | of 11,002 |
  |---|---|---|
  | `matched_bill_id` | **0** | 0.00% |
  | `matched_payment_id` | **0** | 0.00% |
  | `matched_invoice_id` | **0** | 0.00% |
  | `matched_bill_payment_id` | **0** | 0.00% |
  | `matched_journal_entry_id` | 170 | 1.55% |
  | `matched_load_id` | 13 | 0.12% |
  | `categorized_at` | 170 | 1.55% |
  CLS-LINKAGE-ONEWAY's LINK-006 claimed "matched_bill_id 0%, matched_payment_id 0%, 10970 txns" — still exactly true, now over **11,002** transactions (the population grew by 32 since the card was written, so the gap is widening, not closing). CLS-BANK-MATCH-DENSITY's SS-003 claimed 170/10,970 categorized (1.5%) — still 170, now **1.55% of a larger denominator**: the numerator has not moved at all.
  **The honest qualifier, which I am applying deliberately.** Under the standing rule that imported history is not a defect, a Plaid/QBO-origin bank row carrying no TMS-native bill or payment match is the expected state, not a bug — and the CLS-BANK-MATCH-DENSITY card already retired SS-001/002/004/005 on exactly that reasoning. So "0%" alone is not a verdict. What makes these two genuinely open rather than expected is that the numerator is **absolutely zero on four separate FKs** and **frozen at 170 on the fifth**: not low, not lagging, but never once written for bills, payments, invoices or bill-payments across 11,002 rows.
  **Both trace to a single operational cause, which is worth stating because it changes the fix.** LV-040 established that `reconciliation_cleared` is true on **0 of 6,005** TRANSP bank transactions and that no reconciliation period has ever been closed; LV-031 established that no accounting period has ever been closed. Matching a bank transaction to a bill or payment is what reconciliation *does*. So LINK-006 and SS-003 are not two independent linkage defects to be backfilled — they are the measured footprint of a control that has never been exercised. Backfilling the FKs directly would manufacture linkage that no one reconciled; running reconciliation is what should populate them. This is why LV-040's finding (Close period enabled with zero cleared items) matters more than it first appears: the one control that would drain both of these classes is also the one that can currently be attested without doing anything.
  Consequently BANK-CLS-SHARED's four blockers resolve as: **CLS-UNIT-SCALE drained** (LV-043), **CLS-SILENT-CAP stale text, narrow latent risk** (LV-045), **CLS-LINKAGE-ONEWAY and CLS-BANK-MATCH-DENSITY genuinely open** (this finding) — and all four carry a `guard` field naming a script that does not exist (LV-044), so none can be proven either way by its own criteria.
- severity:  major (two live classes; module completion correctly blocked by these two, incorrectly by the other two)
- LANE:      CC-1 (money) — categorization/matching coverage; the operational remedy is reconciliation, not an FK backfill
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. `banking.bank_transactions` unvoided visible **11,002** vs `n_live_tup` **11,002** (complete; `n_tup_del` 46 historical). Column populations as tabulated. Cross-reference: LV-040 `reconciliation_cleared` 0/6,005 TRANSP; LV-031 accounting.periods 120 open / 0 closed.
- status:    OPEN

## LV-047  BANK-ECON-04 is marked PASS on a "zero-diff closure" that compares $0.00 against $0.00 on an account holding 931 transactions — the variance is vacuous, and the session was never finalized
- module:    banking (BANK-ECON-04 "reconciliation_sessions > 0 with zero-diff closure (#3417)"; also bears on BANK-SURF-04)
- entity:    TRANSP
- surface:   `banking.reconciliation_sessions`
- observed:  Both items are marked **PASS** in `docs/module-completion/banking.json`. The literal predicate "sessions > 0" is satisfied — there are **2**. What the PASS does not survive is its own second clause, "with zero-diff closure".
  | session | account | period | status | statement bal | book bal | variance | reconciled_at | finalized_at |
  |---|---|---|---|---|---|---|---|---|
  | `fa95376a…` | …6103 | 2026-07-01→07-31 | **open** | **$0.00** | **$0.00** | $0.00 | null | null |
  | `c14f499e…` | …6129 | 2026-01-01→01-31 | reconciled | **$0.00** | **$0.00** | $0.00 | 2026-07-30 | **null** |
  **The item's own evidence text concedes the mechanism.** BANK-ECON-04 and BANK-SURF-04 both record: *"LIVE 2026-07-30 Neon lucia: reconciliation_sessions=2 (reconciled=1 open=1). **Smoked** POST /reconciliation/start on 6103+6129; zero-diff complete on 6129 session c14f499e (Jan 2026, variance=0)."* So the PASS is explicitly founded on a smoke-test of the start endpoint plus a variance reading — not on a reconciliation of any transactions. Both items also carry **`prod_verified: false`**.
  **The zero variance is arithmetic on two zeros, not a tie-out.** Account …6129 holds **931 transactions** and a live balance of **$346.11**; its January session records a statement balance of $0.00 and a book balance of $0.00. A reconciliation that compares nothing to nothing will always report zero difference — it demonstrates that the subtraction works, not that the books agree with the bank. That is the precise shape of a fake-green: the acceptance criterion is met by a row that proves nothing about the property it exists to guarantee.
  Two further facts undercut the PASS:
  - **Neither session is finalized** — `finalized_at` is null on both, including the one whose status reads `reconciled`. So even the "closure" half is unrealised.
  - **Both were created within ten seconds of each other** (`created_at` 2026-07-30T19:05:22 and 19:05:32) and nothing has been created since. That is a scripted seeding, not operational reconciliation. Consistent with it, `reconciliation_cleared` is true on **0 of 6,005** TRANSP bank transactions (LV-040), Banking Home reads "Last reconciled: —", and the Month close wizard reports bank reconciliation pending on all 5 accounts.
  **Self-correction to LV-040.** There I wrote that the reconciliation control "has never run anywhere". That was slightly too strong: two sessions do exist. The accurate statement is that **no reconciliation has ever cleared a transaction or been finalized** — the sessions are empty shells with zero balances. The substance of LV-040 is unchanged, and its more serious point stands independently: "Close period" is enabled with 0/0 progress, which is exactly how a third vacuous session would be created.
  **Read-only confirmed, because I had to rule myself out.** One session matches the account and period I selected while exercising the Reconciliation screen earlier (…6103, July 2026), so I checked whether my own UI interaction had written it. It had not: both rows pre-date this session by five days (`created_at` 2026-07-30 vs `now()` 2026-08-05T02:02Z) and `n_tup_ins` on the table is **2** in total, with no insert since. My prod access remains read-only.
- severity:  major (acceptance item marked PASS on evidence that cannot demonstrate the property)
- LANE:      CC-1 (money) to re-derive BANK-ECON-04 against a session with real statement and book balances; the module-completion Status field belongs to whoever owns `banking.json` — I do not edit it
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user` observed as both `ih35_app` and `neondb_owner` across statements, bypass its own statement. `banking.reconciliation_sessions`: `n_live_tup` 2, `n_tup_ins` 2, `n_tup_upd` 2, `n_tup_del` 0; full row detail as tabulated. …6129 live balance 34,611¢ with 931 unvoided transactions. `banking.bank_accounts` with `deactivated_at IS NULL AND ledger_account_id IS NULL` = **0 rows**, so BANK-ECON-05's PASS is independently confirmed correct and is **not** challenged here.
- status:    OPEN

## LV-048  56 acceptance items across banking + accounting are marked PASS with prod_verified=false on every one; of the six I live-tested this session, three did not survive as written
- module:    banking + accounting (module-completion ledgers)
- entity:    ALL
- surface:   `docs/module-completion/banking.json`, `docs/module-completion/accounting.json`
- observed:  | module | items | PASS | prod_verified | complete |
  |---|---|---|---|---|
  | banking | 19 | **18** | **0** | false |
  | accounting | 39 | **38** | **0** | false |
  **56 items carry a PASS status and not one carries `prod_verified: true`.** By itself that is partly convention — the standing column-ownership rule is that GUARD flips `prod_verified`, so a coder-set PASS legitimately sits at false until GUARD attests it. I am **not** reporting the flag state as a defect. What matters is what happens when the PASS marks are actually tested against production, which is my lane.
  **Sample result, stated with its size.** Six PASS items came under direct live test this session. Three held; three did not survive as written:
  - **BANK-ECON-05** — "all live bank_accounts bound to ledger_account_id": **HELD.** Zero rows with `deactivated_at IS NULL AND ledger_account_id IS NULL`. Correct as marked.
  - **BANK-ECON-02** — "matched_journal_entry_id density meaningful (not ≈0%)": **HELD on its own criterion.** Its evidence defines a floor of `N>=50` absolute matches; 170 clears it. I nearly filed this as contradicting CLS-BANK-MATCH-DENSITY's "1.5% density, open" and checked first — the two measure different things (absolute count vs coverage percentage), so there is no contradiction. Worth noting only that the numerator has been static at 170 while the denominator grew 10,830 → 11,002, so coverage is drifting downward even as the item stays PASS.
  - **BANK-ECON-04 / BANK-SURF-04** — "reconciliation_sessions > 0 with zero-diff closure": **DID NOT SURVIVE** (LV-047). The zero variance is $0.00 against $0.00 on an account holding 931 transactions, neither session is finalized, and the item's own evidence says "Smoked POST /reconciliation/start".
  - **BANK-SURF-05** — "Factoring / Escrow / Relay / Plaid / Statement Import — active path + honest empty": **DID NOT SURVIVE** for Relay (LV-041). The Relay tab's empty state is not honest — it asserts "No Relay fuel wallet is bound for this operating company" while the exact bind it names exists on prod and the wallet carries 1,656 transactions worth −$178,846.43.
  - **ACCT-LINK-01** — inbound FK / "not island": **passes its stated bar but not its purpose** (LV-021). Eleven referencing rows satisfy "not island" while `journal_entry_type_id` is unstamped on 99.5% of the ledger, so JE-type reporting is blind.
  **What this supports, and what it does not.** Six of fifty-six is a small sample and I am not extrapolating a failure rate to the other fifty. What it does establish is that a PASS mark in these ledgers is not currently a reliable predictor of the live property — the three that failed did so in three different ways (vacuous evidence, a false empty-state, and a bar that does not test its purpose), which is the pattern that makes them hard to catch by re-reading the ledger rather than exercising the surface. Given both modules sit one item from `complete`, the PASS marks are load-bearing for a completion decision while carrying zero independent prod attestation.
  Recommendation: treat GUARD's `prod_verified` pass over these 56 as a prerequisite to declaring either module complete, and prioritise the items whose acceptance text contains a smoke-test or an existence check rather than a measured property.
- severity:  major (completion gating rests on self-attested PASS marks; 3 of 6 sampled failed live)
- LANE:      GUARD (independent prod verification) — the Status/prod_verified columns belong to GUARD and the module-completion owner. **I edit neither file**; this is a routed observation only.
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`/`neondb_owner`, bypass its own statement — per-item evidence recorded in LV-021, LV-041, LV-047 and this turn's BANK-ECON-05/02 checks. Ledger counts read from the two module-completion JSON files at main `6901cf9e0`.
- status:    OPEN

## LV-049  SAF-B08's FAIL is accurate (1 signed clause of 86 active drivers) — and the one signed instance carries no signed PDF, so the sole piece of evidence gating escrow forfeiture has no artifact
- module:    safety (SAF-B08) — chains into banking/accounting escrow
- entity:    TRANSP
- surface:   `legal.contract_instances` · Escrow forfeit gate
- observed:  **The item is honestly marked and I am confirming it rather than challenging it.** SAF-B08 is `status: FAIL` with evidence "prod density of signed `legal.contract_instances` remains ~1 of ~89 active drivers — gate correctly blocks forfeit; owner must get clauses signed in Legal." Measured today: `legal.contract_instances` holds **exactly 1 row** against **86 active TRANSP drivers** (`deactivated_at IS NULL AND archived_at IS NULL`). The claim is current and correct — 1 of 86, a density of **1.2%**. A FAIL that still reproduces on live data eight days after it was written is a well-maintained item, and I am recording it as verified-accurate.
  **What the item does not say, and what I found by reading the row.** The single instance is driver **Antonio Navarrete Leon**, `signer_type = driver`, `status = signed_electronically`, `signed_at = 2026-07-30T20:52:36Z` — and **`signed_pdf_attachment_id IS NULL`**. There is no stored signed document behind it.
  For a system that holds legal-evidence data for a real carrier, and where a signed clause is the control that permits escrow forfeiture — a money movement against a driver's held funds — a contract marked *signed electronically* with no retained artifact is an evidentiary gap, not a cosmetic one. If forfeiture were ever exercised on the strength of this row, the company could not produce the signed instrument to an attorney, auditor or court; it could produce only a status column asserting one existed.
  **This is the same class as three findings already in this file**, which is why it is worth naming rather than filing as a one-off: LV-010 (queue rows claiming `sent` while the provider was a console stub), LV-013 (an invoice reaching `sent` with no `email_queue` row at all), and LV-026 (an "Audit Trail" with no append-only backing). In each case a status field asserts a completed act while the artifact that would prove it is absent. Here the stakes are the highest of the four, because the artifact is a signed legal instrument.
  **The chain this closes.** LV-030 recorded that the entire escrow cluster is unused — `accounting.escrow_accounts`, `escrow_postings`, `driver_finance.escrow_balances`, `escrow_ledger` and `escrow_deductions_pending` all at `n_tup_ins = 0` — and treated that as configured-but-never-started rather than a defect. SAF-B08 explains why: the forfeit gate correctly refuses to act while clauses are unsigned. So escrow's emptiness is not a broken poster, it is a control working as designed upstream. That is a satisfying, and correct, resolution of an open question from earlier in this sweep.
- severity:  major (the one artifact gating a money control does not exist; SAF-B08's own FAIL is accurate)
- LANE:      owner action for clause signing (Legal), per the item's own text; **the missing signed PDF routes to CC-1/Legal owner** as a distinct defect from the density gap
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. `legal.contract_instances` `n_live_tup` 1, `n_tup_ins` 2, `n_tup_del` 0; sole row as quoted with `signed_pdf_attachment_id IS NULL`. `mdata.drivers` active TRANSP = **86**. Cross-reference LV-030 escrow tables all `n_tup_ins = 0`.
- status:    OPEN

## LV-050  GUARD after-merge proof — JE balance PASS (1,787 of 1,787), control-account tie-out FAIL: A/R control carries a $961,983.52 CREDIT against an $831,073.13 debit subledger, all of it from the provisional opening entry
- module:    accounting (GUARD live-verify-after-merge, first pass)
- entity:    TRANSP (opening entry), all entities for the JE balance check
- surface:   `accounting.journal_entry_postings` · `accounting.chart_of_accounts_roles` · `accounting.invoices`
- observed:  First GUARD sweep under the new remit. Two of the four named checks are reported here; both measured live on prod with `set_config('app.bypass_rls','lucia')`.
  **CHECK 1 — every JE has DR = CR: PASS, absolutely.** Across **1,787 journal entries**: balanced **1,787**, unbalanced **0**, total imbalance **0 cents**. There is no partial or rounding drift anywhere in the ledger. This is a genuine, unqualified pass and the strongest single integrity result in this file — it also confirms the `trg_check_journal_entry_balanced` constraint trigger (LV-026) is doing its job.
  **CHECK 2 — control accounts tie to sub-ledgers: FAIL on A/R.**
  - GL `ar_control` net (debits − credits) = **−96,078,252¢ = −$960,782.52**, i.e. a **credit** balance on an asset account.
  - Invoice subledger (unvoided, all entities) = **83,107,313¢ = $831,073.13** open across **11,983** invoices (TRANSP alone: $829,871.13 / 11,979).
  - **Variance ≈ $1,791,855.65**, and the control account's sign is opposite to what a receivable can normally hold.
  **The cause is one posting, and I traced it rather than reporting a bare variance.** The `ar_control` account carries only **7 postings in total**. Six are small and correct — 3 `invoice` debits ($1,206.00), 1 `customer_payment` credit ($5.00), and a $15,000.00 revrec debit fully offset by its owner-authorized $15,000.00 reversal (the L-20260624-0083 test load, backed out 2026-08-01 with the memo "No POD exists and none will be fabricated"). The seventh is the whole balance: a **$961,983.52 credit** from JE `69acbf78…`, `entry_date` 2025-01-01, `source: manual`, memo **"Opening balance — QBO Balance Sheet 12/31/2024 (signed-actual, NI rolled to RE)"**.
  **I checked whether the opening entry is sign-inverted, and it is not.** The entry is balanced (30 lines, DR = CR = $10,883,726.52) and its category totals initially look wrong — assets net credited $8.3M, equity debited $7.96M, liabilities net debited $332,957.80. Reading the actual lines shows a mixed, not uniform, pattern: PNC-2954 ($1,629,264.65) and IBC-5231 ($347,613.28) are debited normally, while IBC-AHORROS-6089 ($438,691.43), BOA-SAVINGS-1148 ($76,499.08), RTS FINANCIAL-VIRTUAL ACCT ($8,528,357.32), RTS-Factoring Reserves ($449,259.01) and A/R are credited. That is exactly what the memo's stated method — **"signed-actual"** — produces: the QBO balance sheet's signed figures transcribed directly, so any account reported negative was credited regardless of its type. Retained Earnings debited $7,962,226.15 is an accumulated deficit, entirely plausible for a Ch.11 carrier. **So the entry is faithful to its own stated method; it is not a transcription sign bug, and I am not reporting it as one.**
  **What this means, and what must NOT be done about it.** The consequence is real: any balance sheet drawn from this ledger shows A/R as a negative asset, and the A/R control does not tie to its subledger by $1.79M. But the source is the **opening balance**, which is **owner-entered and owner-reserved**, and these cloned QBO balances are already on record as PROVISIONAL pending the embezzlement matter — the ledger itself contains accounts named "Unauthorized Expenses Ignacio Muñoz" ($350,451.38) and "Unauthorized Expenses Anarely Alcazar" ($73,253.48). **No coder should adjust, reverse, or re-sign this entry.** Correcting an opening balance is an owner act, and doing it would also be a correcting JE that moves balances — explicitly owner-reserved. I am recording the tie-out failure as a measured fact and routing it to the owner, not proposing a fix.
  **Reconciliation is frozen per the 2026-08-05 ruling, and this finding respects that** — it is a control-account tie-out and a double-entry integrity proof, not a Faro/QBO/transaction reconcile. I have opened no reconcile work.
- severity:  major (control account does not tie and carries a wrong-signed balance; cause is a provisional owner-entered opening balance, not a poster defect)
- LANE:      OWNER (opening balances are owner-reserved) — CC-1 only if the tie-out is to be reported differently in the UI; **no coder edits this entry**
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. JE balance: 1,787 entries, 1,787 balanced, 0 unbalanced, 0¢ imbalance. `ar_control` active bindings: TRANSP QBO-45, USMCA 1100, TRK TRK-1100. `ar_control` postings = 7, enumerated above with JE ids, entry_dates and memos. Opening JE `69acbf78…`: 30 lines, DR 1,088,372,652¢ = CR 1,088,372,652¢. Invoice subledger unvoided 11,983 / 83,107,313¢. GL `ap_control` net credit 33,575,339¢ = $335,753.39 — **A/P tie-out not yet computed against the bills subledger; UNVERIFIED, next GUARD pass.**
- status:    OPEN

## LV-051  GUARD pass 2 — A/P control misses its subledger by $4.27M, and the cause is structural: under parallel double-books the TMS GL holds 5 of 16,250 bills, so control-account tie-out CANNOT pass by design. Do not "fix" it by posting imported history.
- module:    accounting (GUARD live-verify-after-merge, pass 2)
- entity:    ALL
- surface:   `accounting.chart_of_accounts_roles` (`ap_control`, `ar_control`) vs `accounting.bills` / `accounting.invoices`
- observed:  **A/P tie-out: FAIL by $4,269,770.51.**
  - GL `ap_control` net credit = **33,575,339¢ = $335,753.39**, from just **1,555 postings**: `fuel_event` credits 62,554,639¢ (1,547 lines), `prepaid_purchase` 30,000¢, `bill` credits **3,205¢ across only 5 lines**, less the opening-balance debit 29,012,005¢ and one `bill_payment` debit of 500¢.
  - Bills subledger (unvoided) = **16,250 bills**, billed $58,154,535.73, paid $53,549,011.83, **open $4,605,523.90** (unpaid 1,115 = $3,999,994.08; partial 526 = $605,504.82; draft 1 = $25.00).
  **The decisive number is 5 of 16,250.** Only five bills have ever produced an A/P posting in the TMS general ledger. The same holds on the receivable side: LV-050 found `ar_control` carries **7 postings total**, of which just **3** are invoices, against an **11,983-invoice** subledger.
  **ATTRIBUTION — this was already established in the repo before I measured it, and I should have searched first.** Audit ledger **row 665** (`accounting · clone_vs_native_posting`, CLAUDE-CODER, 2026-08-03) records the same conclusion in nearly the same words: *"`accounting.bills` 16,248 total / 16,245 carrying a `qbo_bill_id` — 99.98% cloned … cloned history is **not supposed to post** … **The danger is concrete: backfilling JEs for 16,245 cloned bills would double the books against the system of record.**"* Row 670 then proves the engine enforces it. My independent measurement corroborates both rather than discovering anything new — useful as a second, later confirmation on a grown dataset (16,250 bills now), but the finding belongs to row 665.
  **This is the parallel double-books architecture behaving exactly as specified, and it is NOT a defect.** QBO is the system of record; the imported bill and invoice history was cloned into `accounting.*` as subledger data and deliberately never posted into the TMS GL. The TMS ledger therefore contains only TMS-native economic events (overwhelmingly `fuel_event`, 1,547 of 1,555 A/P lines) plus the provisional opening balance. A GL that holds 5 bills cannot tie to a subledger holding 16,250 — and under this design it is not supposed to.
  **The GUARD consequence, which is the point of recording it.** The control-account tie-out named in my remit **cannot pass under the current architecture**, on either A/P or A/R, and will keep producing alarming multi-million-dollar variances ($4.27M on A/P, ~$1.79M on A/R) that are expected rather than wrong. Two failure modes follow from that, and both are worse than the variance itself:
  1. **A future reader treats the variance as a defect** and "corrects" it by posting the 16,250 imported bills and 11,983 imported invoices into the TMS GL. That would **double-count every one of them against QBO**, destroying the parallel-books separation and materially misstating both AP and AR. This is the single most dangerous available "fix" in the accounting module and it must not be attempted.
  2. **The variance is dismissed wholesale**, so a genuine future break in the TMS-native slice hides inside a number that is already millions off.
  **The correct GUARD formulation, which I am adopting going forward:** tie the control account to the **TMS-native subledger slice only** — bills and invoices that actually have GL postings — never to the full imported population. On that basis A/P currently reconciles across 5 bills and A/R across 3 invoices, which is a meaningful, if tiny, check that will grow as go-forward volume posts.
  **Refinement to LV-050.** There I attributed the A/R variance to the provisional opening balance. That was correct but incomplete: the opening credit of $961,983.52 explains the *sign and magnitude* of the `ar_control` balance, while the *variance against the subledger* is driven by the same structural cause identified here — 11,980 of 11,983 invoices were never posted. Both statements hold; this is the fuller one.
- severity:  major as a reporting fact, **NOT a code defect** — the risk lives entirely in how the variance is interpreted
- LANE:      GUARD (mine) for the corrected tie-out formulation; **no coder action, and explicitly no backfill of imported history into the GL**
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. `ap_control` postings by source/side as enumerated; net credit 33,575,339¢. `accounting.bills` unvoided 16,250 (`n_live_tup` 16,250, `n_tup_del` 28): `amount_cents` 5,815,453,573¢, `paid_cents` 5,354,901,183¢, open 460,552,390¢; status split paid 14,608 / unpaid 1,115 / partial 526 / draft 1. Cross-ref LV-050: `ar_control` 7 postings, invoice subledger 11,983 / 83,107,313¢; all 1,787 JEs balanced DR=CR.
- status:    OPEN (informational — records that this check cannot pass by design)

## LV-052  GUARD pass 3 — both-way links PASS forward (3,094/3,094) with one reverse orphan: a $197.03 Relay fuel purchase silently never posted because its vendor was unmatched, and nothing surfaces it
- module:    accounting / fuel (GUARD live-verify-after-merge, pass 3)
- entity:    TRANSP
- surface:   `fuel.fuel_transactions` ↔ `accounting.journal_entry_postings` (`source_transaction_type='fuel_event'`)
- observed:  Third GUARD check — both-way link resolution, run against the path that dominates the live ledger (1,547 of 1,555 A/P postings are `fuel_event`).
  **Forward direction: PASS, cleanly.** Every fuel posting resolves to a real source row — **3,094 of 3,094** `fuel_event` postings (1,547 events × 2 lines) have a `source_transaction_id` that matches an existing `fuel.fuel_transactions.id`. **1,547 distinct sources, zero NULL source ids, zero orphans.** No posting points at a row that does not exist, which is the failure this check exists to catch.
  **Reverse direction: one orphan of 1,548.** `fuel.fuel_transactions` holds 1,548 rows; 1,547 have GL postings. The single unposted row is a **real economic event, not a stub**:
  `df514526-71b2-46c9-a00c-0b2439dc1a09` — TRANSP, `transaction_at` 2026-08-03T22:28:59Z, **$197.03**, 39.551 gallons of diesel at $4.9812, merchant **Love's**, Laredo TX, imported via the Relay bridge at 2026-08-04T12:00:54 and touched again at 14:18.
  **CORRECTION — my first root cause was WRONG and I am replacing it.** I originally wrote that the row's `notes` (`relay_bridge=1; … load_unresolved=1; vendor_unmatched=1`) stated its own cause, and concluded "the poster requires a matched vendor … the **vendor** is what blocked posting." That is false, and measuring the population disproves it: **`vendor_id` is NULL on all 1,548 fuel transactions (0 with a vendor), and 1,547 of them posted anyway.** Vendor was never a posting precondition. I mistook a Relay-bridge import annotation on the row for the posting engine's reason — exactly the kind of plausible-but-unverified inference this file exists to prevent. Audit ledger row 655 independently records the same population fact (`vendor_id`=0/1,547, 0%).
  **The actual cause is timing, and it is structural.** The newest *posted* fuel transaction was imported **2026-07-31T20:21:36Z**, and the newest fuel journal entry was created **2026-08-03T15:06:32Z**. The orphan was imported **2026-08-04T12:00:54Z** — after the last posting run. Exactly **1** fuel transaction has been imported on or after 2026-08-04, and **0** of that cohort is posted. Fuel GL posting for Relay-imported rows runs through `reflush-unposted-fuel-gl.service.ts` (FUEL-01), an **on-demand idempotent re-flush**, not a scheduled job: the only fuel crons initialised at startup are `relay-fuel-ingest-cron` (which imports) and `fuel-gps-match-cron` (which matches GPS) — **neither posts to the GL**. So Relay-imported fuel accumulates unposted until someone runs the reflush. At the time of writing that backlog is 1 row, roughly 38 hours old.
  The `load_required = false` / `load_exemption_reason = PRE_TMS_DISPATCH_IMPORT` fields are a sanctioned exemption and are not implicated either.
  **Why a $197.03 gap is worth a finding.** The amount is immaterial; the mechanism is not. Nothing surfaces this row as unposted — no alert, no queue, no counter. It is discoverable only by doing exactly what I did here: differencing the subledger against the GL. That places it in the same class as LV-027 (36,468 unalerted scheduled-report failures), LV-013 (an invoice reaching `sent` with no queue row) and LV-035 (a 500 rendered as "feature not enabled") — a failure presented as a non-event. Every future Relay fuel purchase whose merchant does not match a vendor will silently miss the GL the same way, and because Relay is a live daily feed the count grows on its own. Today it is 1 of 1,548 (0.06%); the number that matters is that the correct value is 0 and there is no signal when it moves.
  This also gives the fuel poster a clean bill on the part that matters most: of 1,548 events it posted 1,547 correctly and balanced (all 1,787 JEs are DR=CR per LV-050), and it did **not** invent a vendor or post to a fallback account to force the one problem row through — it declined to post, which is the right behaviour. The defect is purely that declining is silent.
- severity:  minor by amount ($197.03), **major by class** — GL posting for a live daily import feed depends on a manual re-flush with no schedule and no backlog counter
- LANE:      CC-1 (money/fuel) — decide whether the FUEL-01 reflush should be scheduled alongside `relay-fuel-ingest-cron`, and surface the unposted-fuel backlog as a visible counter. **Not** a vendor-matching fix — vendor is NULL on all 1,548 rows and is irrelevant to posting
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. `fuel_event` A/P postings 1,547 with 1,547 distinct `source_transaction_id` and 0 NULL; forward resolution 3,094/3,094 against `fuel.fuel_transactions`; `fuel.fuel_transactions` total 1,548; unposted count **1**, full row quoted above.
- status:    OPEN

## LV-053  A bulk attempt to post all 11,976 QBO-imported invoices into the TMS GL ran on 2026-08-03 in a 22-minute window and EVERY ONE failed — with zero audit events written. 87% of all posting batches are now failed residue from that single event.
- module:    accounting (GUARD live-verify-after-merge, pass 4)
- entity:    TRANSP
- surface:   `accounting.posting_batches` · `audit.audit_events`
- observed:  Posting-batch integrity is structurally sound but the batch table is dominated by one mass failure.
  **Integrity checks first — both PASS.** `orphan_batch_refs` = **0** (no posting references a batch that does not exist) and `je_without_postings` = **0** (no journal entry exists without lines). Those are clean.
  **The mass failure.** `accounting.posting_batches` holds **13,732** rows: `posted` **1,754**, `reversed` **1**, and **`failed` 11,977 — 87%**. Of the failed batches, **11,976 are `source_transaction_type = 'invoice'`** (the remaining one is a bill from 2026-08-02). Characterised:
  - **11,976 batches against 11,976 distinct `source_transaction_id`s** — exactly one attempt per invoice, no duplicates, against an unvoided invoice population of 11,983.
  - **One actor**: `created_by_user_id = e4117991-d2c0-406d-8cda-74e98d95bccd` (the same user that closed the January reconciliation session on 2026-07-30).
  - **One template**: `source_template_code = 'invoice'`, `posting_template_id = fe679f9c-ca7f-4ac1-9333-bec175ead490`.
  - **A single 22-minute window**: first `2026-08-03T06:19:06.260Z`, last `2026-08-03T06:41:33.547Z` — roughly 545 attempts per minute. This is one deliberate bulk operation, not scattered retries.
  **This is the exact operation LV-051 identifies as the most dangerous available "fix" in the accounting module** — backfilling QBO-imported invoice history into the TMS general ledger, which would double-count every document against QuickBooks, the system of record. It was attempted. **It failed completely, and that failure is the reason the books are still correct.** The GL still holds only 3 invoice postings (LV-050), so no double-count occurred.
  **The finding is that 11,976 failures wrote nothing to the audit trail.** I queried `audit.audit_events` across 2026-08-02 and 2026-08-03 for any posting/failure/invoice class. The classes present are `qbo_archive.import_failed` (665), `email.failed` (581), `cron_sync_failed` (49), `outbox.event.failed` (3) and a handful of invoice-creation events — **there is no event class for posting-batch failure at all.** The single largest failure event in this system's recorded history left **zero** trace in the audit stream. It is discoverable only by grouping `posting_batches.batch_status`, which is what I did.
  Nor does the table record **why**: `posting_batches` has no error/reason column (`id, operating_company_id, batch_status, source_transaction_type, source_transaction_id, idempotency_key, created_by_user_id, created_at, updated_at, posting_template_id, source_template_code`).
  **ROOT CAUSE — RESOLVED, and I should not have marked it UNVERIFIED.** I originally wrote that the cause was unknowable without a CC-1 read. It was already answered in this repo, twice, and I found it by searching instead of asking:
  - **Audit ledger row 670** (`accounting · qbo_origin_gl_refusal_by_design`, PROD-VERIFIED, CASCADE): *"**NEW:** `QBO_INVOICE_POST_GL_REFUSED` added in PR #4194 — invoices with `source_system=qbo` are now also refused."* It records the sibling guards too: `qbo_bill_payment_post_gl_refused`, the customer-payment refusal, and PSE enforcement for QBO-origin bills.
  - **Verified in code** at `posting-engine.service.ts:706-711`: `if ((invoice.source_system ?? "").toLowerCase() === "qbo") throw new PostingEngineError("QBO_INVOICE_POST_GL_REFUSED", "Refusing Invoice→GL post for source_system=qbo — parallel books; QBO already holds this A/R + revenue. Do not invent a second TMS journal entry.")`.
  So of the two possibilities I posed, **the first is correct: the posting engine deliberately refused, by design.** The 11,976 "failures" are 11,976 successful refusals of an attempt to double-post QuickBooks history. The books were protected by an intentional control, **not by luck**. PR #4194 landed that guard; the bulk attempt at 06:19Z on 2026-08-03 ran ~3 hours after `invoice-gl.service.ts` was deployed by PR #4097 (merged 03:02Z), so it reads as a backfill attempt against the newly-deployed poster, correctly rebuffed.
  **What remains a genuine finding, now correctly scoped and much smaller:** a *designed refusal* is recorded with `batch_status='failed'` and no reason code, and emits no audit event — so it is indistinguishable from a real failure. Anyone reading this table sees 11,977 failures (87% of all batches) and cannot tell that they are the system working correctly. That is an observability defect, not a posting defect: refusals should carry their `PostingEngineError` code and be classified distinctly from genuine failures.
  **Forward risk — I first called this "retry-shaped" and then read the mechanism, which materially lowers it. Correcting my own claim.** The idempotency key is fully deterministic — `buildPostingMvpIdempotencyKey` composes `["ih35:posting-mvp:v1", operating_company_id, source_transaction_type, source_transaction_id, source_transaction_line_id, posting_purpose]` with **no timestamp and no nonce** — so a repeat attempt on the same invoice reproduces the same key. Two mechanisms then apply:
  1. `getExistingPostingResultByIdempotencyKey` returns a short-circuit result **only** when the existing batch is `posted` or `reversed`; for a `failed` batch it returns null, so the caller proceeds to try again.
  2. The success-path INSERT into `posting_batches` carries **no `ON CONFLICT` clause** (unlike the failure path, which upserts). A second attempt therefore violates the unique index on `(operating_company_id, idempotency_key)` and **throws** rather than creating a second batch.
  So a naive retry or replay of these 11,976 **cannot silently double-post** — it errors out. The failed rows function as permanent idempotency tombstones, and that is protective. **Risk of accidental double-count: LOW**, not the high-consequence exposure I initially recorded.
  **The one route that does bypass it** is a deliberate **repost**: `buildPostingMvpIdempotencyKey` appends a `repost_revision` suffix when `posting_purpose === 'repost'`, producing a byte-different key that sidesteps the tombstone and can create a fresh postable batch. That path is real, and it is exactly the operation the owner has reserved to himself ("running a reverse+repost or correcting JE that moves balances"). So the guard against the LV-051 double-count is a combination of a deterministic key and an owner-reserved gate — adequate, but worth stating explicitly so nobody assumes a bulk repost is a safe cleanup for 11,976 stale batches. **It is not: a bulk repost of this cohort is the double-count.**
- severity:  minor — **twice downgraded (critical → major → minor) as verification replaced inference.** The mass "failure" is the posting engine correctly refusing to double-post QBO history (`QBO_INVOICE_POST_GL_REFUSED`, ledger row 670, code-verified). Nothing is broken. The residual defect is purely observability: refusals are stored as `failed` with no reason code and no audit event.
- severity-superseded:  major — **downgraded from critical by my own follow-up verification.** The accidental double-count cannot happen via retry (deterministic idempotency key + no `ON CONFLICT` on the success-path insert). What remains major: 11,976 failures wrote **zero** audit events, the cause is unrecorded, and a deliberate bulk **repost** would still double-count.
- LANE:      CC-1 (money) — establish why the 11,976 failed and emit an audit event for posting-batch failure. Retry safety is now VERIFIED, so this is not an emergency. **Do not bulk-repost this cohort:** a repost appends a revision to the idempotency key, bypasses the tombstone, and would produce exactly the LV-051 double-count.
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user` observed `ih35_app` and `neondb_owner`, bypass its own statement. `posting_batches` 13,732 total — failed 11,977 / posted 1,754 / reversed 1. Failed-invoice cohort: 11,976 batches, 11,976 distinct source ids, 1 actor, 1 template, window 2026-08-03T06:19:06.260Z→06:41:33.547Z. `journal_entry_postings` 3,603 total, 93 with no batch, 1,755 distinct batches referenced, **0** orphan batch refs; **0** journal entries without postings. `audit.audit_events` for 2026-08-02/03 contains no posting-batch-failure class.
- status:    OPEN

## LV-054  GUARD passes 5–7 — entity isolation PASS (0 leaks), append-only WORM PASS across 4.5M audit rows, void-not-delete clean on every core money table; 2 TMS-native invoices posted today, and `n_live_tup` is an estimate that drifted 8%
- module:    accounting (GUARD live-verify-after-merge, passes 5–7)
- entity:    ALL
- surface:   `accounting.*`, `audit.*`, `banking.bank_transactions`
- observed:  **PASS 5 — entity isolation: clean on all three cross-checks.** Zero postings whose `operating_company_id` differs from their journal entry's; zero postings booked to a `catalogs.accounts` row belonging to another entity; zero postings sitting in a `posting_batches` row belonging to another entity. **0 / 0 / 0.** For a three-entity ledger (TRANSP / TRK / USMCA) with a standing cross-entity-leak concern, this is a genuine and important pass — the multi-entity boundary holds inside the GL.
  **PASS 6 — append-only WORM, verified at scale.** `audit.audit_events` **2,242,668 rows with `n_tup_upd` 0 and `n_tup_del` 0**; `audit.row_changes` **2,280,887 rows, also 0 and 0**. Across **4.5 million audit rows there has never been an update or a delete.** The append-only guarantee is not aspirational here — it holds in production at volume. This is the strongest structural result in this file and it stands in deliberate contrast to LV-026: the audit *schema* is genuinely immutable; what LV-026 found is that the accounting **Audit Trail page** does not read it.
  **Void-not-delete: clean on every core money table.** `n_tup_del` = 0 for `journal_entries`, `journal_entry_postings`, `posting_batches`, `invoices`, `payments`, `bill_payments` and `periods`. Two tables carry historical deletes — `banking.bank_transactions` **46** (12,216 inserted / 11,002 live) and `accounting.bills` **28** (16,288 / 16,250). Both are plausibly import-dedup churn rather than user deletions, and `pg_stat` counters accumulate since the last stats reset so they cannot be dated. **Not filed as a violation** — flagged only so a later reader knows the two non-zero counters were seen and considered.
  **Go-forward posting is alive.** In the last four hours the only batch activity was **2 batches, both `batch_status='posted'`, both `source_transaction_type='invoice'`** (2026-08-05T00:05:10Z and 01:08:13Z). Since QBO-origin invoices are refused outright (LV-053), these are TMS-native invoices posting correctly — direct evidence the go-forward path works, on the same day the imported cohort was refused.
  **PASS 7 — posting-template integrity: clean.** `catalogs.posting_templates` holds **22** templates (note the canonical table is `catalogs.posting_templates`, not `accounting.posting_templates`, which does not exist). **Zero** batches reference a template id that does not exist. Nine batches carry a NULL `posting_template_id`, and all nine are terminal-successful — **8 `posted`, 1 `reversed`** — so a missing template never blocked a post; they read as early postings predating template assignment. Template usage by source: invoice 11,979, fuel_event 1,547, bank_categorization 187, bill 5, transfer 4, expense 2, customer_payment 1.
  **A methodological correction I am recording because it affects my own discriminator.** I observed `pg_stat_user_tables.n_live_tup` for `posting_batches` at **14,909** and reported that the table had grown by ~1,177 during this session. It had not: `SELECT count(*)` returns **13,732**, unchanged. `n_live_tup` is an ANALYZE-maintained **estimate** and had drifted roughly 8% high. This matters beyond the one number, because the completeness discriminator I use throughout this file compares `visible == n_live_tup` to decide whether an RLS-scoped count is trustworthy. That test remains sound for detecting gross masking, but an exact match should not be demanded and a small divergence is not evidence of hidden rows — **an authoritative count must come from `count(*)`, with `n_live_tup` used only as a corroborating order-of-magnitude check.**
- severity:  informational — four structural passes (entity isolation, WORM, void-not-delete, template integrity); no defect
- LANE:      none — GUARD attestation only
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement, `db_now` 2026-08-05T02:42:58Z. Entity isolation: 3 mismatch queries each returning 0. `pg_stat_user_tables` snapshot for the 11 tables listed. `posting_batches` authoritative `count(*)` = 13,732 vs `n_live_tup` 14,909. Recent-batch window: 2 rows, both posted invoices, 00:05:10Z and 01:08:13Z. `catalogs.posting_templates` 22 rows; orphan template refs 0; NULL-template batches 9 (8 posted, 1 reversed).
- status:    OPEN (informational)

## LV-056  **P0 — the entire Owner homepage is DOWN on production.** `ScenarioTrackerPanel.tsx:164` spreads `data.scenarios` unguarded; `audit.scenario_status` is empty, so the spread throws and the error boundary kills all of `/home`
- module:    home / scenario-tracker (GUARD verify-after-merge)
- entity:    TRANSP
- surface:   `https://app.ih35dispatch.com/home` · `ScenarioTrackerPanel` · `audit.scenario_status`
- observed:  **`/home` does not render. It shows "Something went wrong — The page hit an unexpected error."** Captured live from the deployed build:
  `TypeError: i.scenarios is not iterable` at `assets/OwnerHome-LbhU1yG3.js:1:35090`, inside a `useMemo` (`Object.fs [as useMemo]`), re-entered at `OwnerHome-LbhU1yG3.js:1:35067`.
  This is a **regression within this session** — `/home` rendered normally earlier tonight (Pending Owner Approvals, Today's Revenue, Open Loads, Cash Position $4,717, the "Overdue bills and customers · Count 277" tile and driver day-summaries were all read from it, and are cited in LV-034).
  **Exact cause, located in source.** `apps/frontend/src/components/home/ScenarioTrackerPanel.tsx:164`:
  `return [...data.hops, ...data.scenarios];`
  An unguarded double spread inside a `useMemo`. Spreading `undefined` throws `TypeError: … is not iterable`, which matches the deployed error verbatim. `ScenarioTrackerPanel` is mounted unconditionally at `apps/frontend/src/pages/home/OwnerHome.tsx:243`, so the throw escapes into the page-level error boundary and **the whole owner homepage is lost, not just the panel**.
  **Why the payload lacks `scenarios` — the two findings are the same finding.** `audit.scenario_status` is **empty on prod**: `count(*)` = **0 total, 0 `is_current`, 0 `state='passed'`**, and the view `audit.v_scenario_status_current` returns **0** rows. Lifetime counters are `n_tup_ins` 1 / `n_tup_del` 1, so exactly one row was ever written and it was removed — the certifier has never persisted a result. `audit.audit_events` contains **0** scenario/certify-class events. `scenario-tracker.service.ts:78` reads `FROM audit.scenario_status` (`is_current`), so with no rows the response carries no populated `scenarios` array and the panel spreads `undefined`.
  Notably **no `/api/v1/home/scenario-tracker` request is issued at all** on the failing load — the crash occurs in the render/`useMemo` path before or independently of the fetch, which is consistent with a missing-field spread rather than a network error.
  **The fix is one line and safe:** `return [...(data.hops ?? []), ...(data.scenarios ?? [])];`. That restores the homepage immediately and degrades the panel to empty, which is the honest state given the table is empty. It does not require the certifier to work.
  **I am not applying it.** My lane is read-only GUARD — no build, no merge. Routing to Cursor (FE) as P0. If the owner wants me to break read-only for this one line, that is his call to make in chat.
- severity:  **P0 — production owner homepage completely unavailable**
- LANE:      CURSOR (FE) — one-line nullish-coalesce at `ScenarioTrackerPanel.tsx:164`. Separately CC-1 owns why `audit.scenario_status` is never populated by the certifier.
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user` observed `ih35_app` and `neondb_owner`, bypass its own statement, `db_now` 2026-08-05T02:51:13Z. `audit.scenario_status`: `count(*)` 0 total / 0 current / 0 passed; `n_tup_ins` 1, `n_tup_upd` 0, `n_tup_del` 1. `audit.v_scenario_status_current` 0 rows. Scenario/certify audit events 0. Live browser error and stack captured from `https://app.ih35dispatch.com/home` on the deployed bundle `OwnerHome-LbhU1yG3.js`.
- status:    OPEN — **P0**

  **RESOLVED 2026-08-05 by PR #4368** — one-line nullish-coalesce at `ScenarioTrackerPanel.tsx:164` plus a mutation-verified regression test. The panel now degrades to empty instead of taking `/home` down. The underlying cause (certifier never populates `audit.scenario_status`) is UNCHANGED and stays routed to CC-1, as does the fact that `verify-no-false-green-certify` and `verify-homepage-scenario-tracker-staleness` both stayed green (exit 0) throughout the outage.

## LV-057  GUARD pass 8 — the WORM audit records journal-entry HEADERS but not their LINES: `journal_entries` 1,837 audit rows, `journal_entry_postings` 0, `posting_batches` 0, `payments` 0 of 12,124, and the entire `driver_finance` schema 0
- module:    accounting / driver_finance (GUARD live-verify-after-merge, pass 8)
- entity:    ALL
- surface:   `audit.row_changes` coverage vs the money tables
- observed:  LV-026 reported that `audit.row_changes` holds no rows for `journal_entry_postings`. That was true but I framed it too narrowly, as if the WORM store were generally unused. It is not: `audit.row_changes` holds **2,280,887 rows** and covers accounting heavily. The real shape is **selective coverage**, and the selection is the problem.
  **What IS audited** (2% `TABLESAMPLE`, extrapolated): `accounting` ~1.7M rows — `bills` (20,416 in sample), `bill_payments` (7,467), `bill_lines` (3,011), `invoices` (2,402), `qbo_accounts` (45), **`journal_entries` (36 in sample; exact count 1,837)**. Also `mdata` ~590K, `banking` ~9.5K, `qbo` ~1K.
  **What is NOT audited — exact counts, not sampled:**
  | table | rows on prod | audit rows |
  |---|---|---|
  | `accounting.journal_entry_postings` | 3,603 | **0** |
  | `accounting.posting_batches` | 13,732 | **0** |
  | `accounting.payments` | 12,124 | **0** |
  | `driver_finance.*` (whole schema) | — | **0** |
  **The header/line split is the finding.** `journal_entries` — the header carrying date, memo and source — is audited 1,837 times. `journal_entry_postings` — the lines carrying **the account, the amount, and the debit/credit direction** — is audited **zero** times. So the audit trail can prove that a journal entry was touched, and cannot prove what any of its money lines were before or after. For an auditor reconstructing a disputed entry that is the wrong half: the header is metadata, the lines are the money.
  **Why the coverage is selective — mechanism, not accident.** There are **0 triggers on any `accounting` table** whose definition references `row_change`. The audit is therefore **application-level**: rows appear only where application code explicitly calls the audit writer. Coverage tracks which code paths were instrumented, not which tables are financially material — which is exactly how the posting engine, the batch writer, the payments path and all of driver_finance came to be silent while the bills path is exhaustively logged.
  **Corroborating instance found this pass.** `driver_finance.driver_settlements` shows lifetime `n_tup_ins` 11 / `n_tup_del` **7** / 0 live — seven settlement rows were **hard-deleted** — and `audit.row_changes` holds **0** rows for that table, so nothing records who deleted them or what they contained. The table also carries no `voided_at`/`archived_at` column (only `status`, `approval_status`), so void-not-delete is not structurally available on it. Settlements are driver pay; deleting them unlogged is the highest-exposure instance of this gap. Settlement volume is otherwise 0, consistent with nothing operational having been created yet, so no live money is affected today.
  **Relationship to LV-026:** LV-026's conclusion stands and strengthens. The Audit Trail page reads the mutable ledger rather than a WORM store, *and* the WORM store would not have covered the posting lines even if it did.
- severity:  major (auditability — the money lines of every journal entry are unlogged; a money table was hard-deleted with no audit record)
- LANE:      CC-1 (accounting) — instrument `journal_entry_postings`, `posting_batches`, `payments` and `driver_finance.*`; a trigger-based writer would close the class rather than the instances
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. Exact counts: `row_changes` where `table_name` = `journal_entry_postings` **0**, `posting_batches` **0**, `payments` **0**, `journal_entries` **1,837**; `schema_name='driver_finance'` **0**. Schema distribution via `TABLESAMPLE SYSTEM (2)`. Triggers on `accounting.*` referencing `row_change`: **0**. `driver_finance.driver_settlements` `n_tup_ins` 11, `n_tup_del` 7, `n_live_tup` 0; columns include `status`, `approval_status`, no void/archive column.
- status:    OPEN

## LV-058  **LV-013 RESOLVED — Hop 0's last blocker is cleared.** The go-forward money path is proven end-to-end on live prod: TMS-native invoice → posted GL batch → email queue row → real Google send with a provider message id
- module:    accounting / email (GUARD live-verify-after-merge)
- entity:    TRANSP
- surface:   `accounting.invoices` → `accounting.posting_batches` → `email.email_queue`
- observed:  LV-013 held Hop 0 open on the finding that an invoice could reach `status='sent'` with **no `email.email_queue` row at all** — an invoice marked sent with zero delivery artifact. LV-023 recorded my recommendation to hold Hop 0 until it closed. **It has closed, and I verified the whole chain rather than just the queue count.**
  **The chain, with timestamps, for `INV-2026-00740`:**
  | step | evidence |
  |---|---|
  | invoice | `25b208fb-2234-4698-8700-88718c144745`, `display_id` INV-2026-00740, `status` **sent**, `total_cents` 500, **`source_system='tms'`** |
  | GL posting | batch `f1ffc3a4-cfa2-4b9e-881e-902fb91b0a44`, `batch_status` **posted**, `source_transaction_id` = the invoice, created **2026-08-05T01:08:13.287Z** |
  | queue row | `623b97ee-fdc3-4794-be4c-e1bef4ef0a70`, `template_key` `invoice-send`, created **01:08:13.397Z** — 110 ms after the batch |
  | delivery | `status` **sent**, `provider` **google**, `provider_message_id` **`19fcf77743a93429`**, `sent_at` **01:09:00.582Z** |
  A second send followed at 01:18:00.570Z (`76c617c5…`, message id `19fcf7fb3594eeb6`). The queue moved **232 → 234** rows, and provider mix is now `console` 232 / **`google` 2** — the first real deliveries in the table's history.
  **Both halves of LV-010/LV-013 are now honest.** LV-010 was the queue *lying* (`sent` while a console stub swallowed the mail); that was fixed to `logged_only`, and all 232 historical rows still carry `provider='console'` / `logged_only`, correctly not claiming delivery. LV-013 was the send *not reaching the queue*; these two rows prove it now does, with a real provider and a real message id. Nothing is marked sent that did not send.
  **The architecture is confirmed working in BOTH directions on the same day.** These invoices posted because `source_system='tms'`. The 11,976 QBO-origin invoices were refused the same day by `QBO_INVOICE_POST_GL_REFUSED` (LV-053). So the posting engine admits TMS-native economic events and refuses imported QuickBooks history — exactly the parallel-books design, demonstrated live in both branches rather than argued from code.
  `source_load_id` is null on this invoice, which is expected state, not a gap: no loads have been created in the TMS (owner, 2026-08-05 — everything TMS-created is test).
  **Hop 0 status.** The blocker I recorded in LV-023 is cleared. The remaining Hop 0 preconditions I verified this pass are also green: exactly **2** real (`is_test_data=false`) driver pay rates exist and both match the owner's instruction — **Fernando Mecor Hernandez** and **GERARDO URBINA**, each `per_mile_pay` at **48¢/mi** on **`short_miles`**, both `is_active`, both drivers active, both TRANSP. Hop 0 itself remains **owner-reserved** and I am not initiating it.
- severity:  informational — this is a PASS and a blocker clearing, not a defect
- LANE:      none — GUARD attestation. Hop 0 go/no-go is the owner's chat decision.
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. `email.email_queue` 234 rows (was 232), status `logged_only` 232 / `sent` 2, provider `console` 232 / `google` 2, newest 2026-08-05T01:17:20.525Z; both sent rows quoted above with provider message ids. `accounting.invoices` INV-2026-00740 as tabulated. Recent invoice batches all `posted`: `1e30e7e4` (53b8ddb3 = INV-2026-00003), `9852e0d8` (e4d2ebdd = INV-2026-00001), `f1ffc3a4` (25b208fb = INV-2026-00740). `driver_finance.driver_pay_rates`: 93 rows, 91 `is_test_data=true`, the 2 real ones as listed.
- status:    OPEN (informational — LV-013 marked RESOLVED)

## LV-059  GUARD pass 9 — go-forward invoice posting is 100% correct: 4 of 4 ELIGIBLE TMS-native invoices posted, and all 3 "unposted" ones are correctly unposted (proforma, draft, $0.00). Two items for the owner: a $0.00 invoice marked `sent`, and the $1,200 WIRE-04 test invoice has now posted to the USMCA ledger.
- module:    accounting (GUARD live-verify-after-merge, pass 9)
- entity:    TRANSP + USMCA
- surface:   `accounting.invoices` (`source_system='tms'`) → `accounting.posting_batches`
- observed:  **The origin split is exact and confirms the parallel-books model numerically.** Unvoided invoices: **11,983 total = 7 TMS-native + 11,976 QBO-origin**, zero with a null `source_system`. The QBO figure is **identical** to the 11,976 refused posting batches of LV-053 — one refusal per imported invoice, no duplicates and no omissions. Bills mirror it: **16,250 total = 5 TMS-native + 16,245 QBO-cloned**, matching audit ledger row 665 exactly on a dataset that has since grown.
  **Scoped to the only population where posting is expected, the result is clean.** Of the 7 TMS-native invoices, 3 have no posted batch — and each is *correctly* unposted:
  | invoice | entity | amount | status | why unposted |
  |---|---|---|---|---|
  | INV-2026-00002 `cf3f7203` | USMCA | $1.00 | **proforma** | a proforma is a non-posting projection by design |
  | INV-2026-00741 `0ce56005` | TRANSP | $0.05 | **draft** | not issued |
  | INV-2026-00004 `f280b52a` | USMCA | **$0.00** | sent | zero total — nothing to post |
  The remaining **4 of 4 eligible** invoices all posted: INV-2026-00001 `06c7af5d` (TRANSP $0.01), INV-2026-00001 `e4d2ebdd` (USMCA $1.00), INV-2026-00740 `25b208fb` (TRANSP $5.00), INV-2026-00003 `53b8ddb3` (USMCA $1,200.00). **There is no unexplained posting gap in the go-forward path.** Stating that plainly because the raw "3 unposted" count would read as a defect and is not one — the same shape as the imported-history trap, one layer in.
  **Two items I am surfacing for the owner rather than filing as defects:**
  1. **INV-2026-00004 carries `total_cents = 0` and `status='sent'`.** A zero-dollar invoice that has been marked sent is odd on its own terms — it is either a test artifact or a line-less invoice that reached send. It posts nothing, so there is no GL consequence, but it is the kind of row that later reads as a real receivable of $0.00 in a customer's history.
  2. **INV-2026-00003 (`53b8ddb3`, USMCA, $1,200.00) has now POSTED to the ledger.** This is the WIRE-04 test invoice on my pending-cleanup list, and it is no longer only a subledger row — batch `1e30e7e4` is `posted`. Cleanup is still owner-held and I have touched nothing, but the cleanup decision is now a GL decision (a posted batch would need reversing, not deleting), which it was not when the item was first parked.
- severity:  informational — a PASS, plus two owner-facing notes
- LANE:      none for the posting result. The two notes are owner decisions; if INV-2026-00004's `sent` status is a defect it routes to CC-1.
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. `accounting.invoices` unvoided: 11,983 total / 7 `source_system='tms'` / 11,976 `'qbo'` / 0 null. `accounting.bills` unvoided: 16,250 / 16,245 with `qbo_bill_id` / 5 without. TMS-native invoices without a posted batch: **3**, each enumerated above with status and amount; the 4 posted ones listed with ids and entities.
- status:    OPEN (informational)

## LV-060  A DRAFT bill posted to the general ledger — the bill poster gates on a DENYLIST (`void`/`voided`/`revoked_at`) while the invoice poster uses an ALLOWLIST, so any status not explicitly blocked posts
- module:    accounting (GUARD live-verify-after-merge, pass 10)
- entity:    USMCA
- surface:   `apps/backend/src/accounting/posting-engine.service.ts` · `accounting.bills` → `accounting.posting_batches`
- observed:  All **5 of 5** TMS-native bills have posted batches — but one of them should not have. Bill **`f8f8e5a4-8c66-4d16-a4c9-44beff6b79e2`** ($25.00) currently has **`status = 'draft'`** and a **`posted`** GL batch.
  **The audit trail proves it posted *as* a draft; it was not posted-then-reverted.** `audit.row_changes` holds exactly **one** row for this bill — the `INSERT` at 2026-08-03T15:52:21.457Z with `new_data.status = 'draft'`. There is no subsequent status change. `updated_at` still equals `created_at` (15:52:21.457Z), so the row was never edited, and the posting batch was created at **15:55:16.925Z — about three minutes later, after the last edit.** The bill was created as a draft, never left draft, and was posted to the general ledger anyway.
  **Root cause: the two posters gate eligibility in opposite directions.**
  - **Invoices — allowlist** (`posting-engine.service.ts:310`): `const INVOICE_ELIGIBLE_STATUSES = new Set(["sent", "partial", "paid", "factored"])`, enforced by `INVOICE_NOT_POSTING_ELIGIBLE`. `draft` is absent, so a draft invoice is refused — confirmed live: INV-2026-00741 (`draft`) has no batch (LV-059).
  - **Bills — denylist** (`posting-engine.service.ts:917`): `if (bill.revoked_at || bill.status === "void" || bill.status === "voided") throw new PostingEngineError("BILL_NOT_POSTING_ELIGIBLE", …)`. Only void/revoked are blocked; **every other status falls through and posts**, `draft` included.
  **Why the direction matters more than the one row.** A denylist fails open. Today it admits `draft`; the moment anyone adds a status such as `pending_approval`, `disputed`, `on_hold` or `submitted`, that status will post to the general ledger automatically, with no code change and no error — because it simply is not named in the block list. The invoice allowlist fails closed: an unrecognised status is refused until someone deliberately adds it. Two parallel posters in the same file disagree on which way to fail, and the money side of a bill is a liability plus expense recognised from a document nobody has issued.
  Live exposure today is **$25.00** on USMCA test data, so nothing material is misstated — this is a control-shape defect, not a live misstatement, and it is cheap to fix now precisely because volume is zero.
- severity:  major (control fails open on the AP side; a draft liability reached the GL, and unknown future statuses will too)
- LANE:      CC-1 (money) — replace the bill denylist with an allowlist mirroring `INVOICE_ELIGIBLE_STATUSES`, and decide explicitly which bill statuses may post. The existing `BILL_NOT_POSTING_ELIGIBLE` error code already exists, so the change is the predicate, not the plumbing.
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. TMS-native bills (`qbo_bill_id IS NULL`, unvoided): **5 of 5 posted**. Offending row `f8f8e5a4…`: `status` draft, `amount_cents` 2500, `created_at` = `updated_at` = 2026-08-03T15:52:21.457Z, batch `posted` at 2026-08-03T15:55:16.925Z, `batch_after_last_edit` true. `audit.row_changes` for that `row_pk`: 1 row, op INSERT, `new_data.status` = draft, no status transitions. Source: `posting-engine.service.ts:310` (invoice allowlist) vs `:917` (bill denylist).
- status:    OPEN

## LV-061  GUARD pass 11 — driver-bill pricing PASSES the owner's Hop 0 rule exactly: all 3 reissued bills price at 48¢ × SHORT miles with arithmetic tying to the cent, 0 rate mismatches, and the mispriced originals were VOIDED not deleted
- module:    driver_finance / settlements (GUARD live-verify-after-merge, pass 11)
- entity:    TRANSP + USMCA
- surface:   `driver_finance.driver_bills` ↔ `driver_finance.driver_pay_rates`
- observed:  The owner's Hop 0 instruction is explicit: *"assign a driver who has a REAL (is_test_data=FALSE) 48¢ rate — Gerardo Urbina or Fernando Mecor Hernandez — so the driver bill prices on the real rate card, not a test rate and not the customer rate. Capture the load's shortest miles so the bill prices."* Every clause of that is now verifiable on prod, and every clause holds.
  **`driver_finance.driver_bills` holds 6 rows: 3 `void` originals and 3 `open` `-R1` reissues.**
  The three originals carried **no pricing basis at all** — `miles_basis`, `miles_basis_type` and `rate_per_mile_cents` all NULL — and were priced at figures inconsistent with a 48¢ rate card: B-20260616-0120 at **$5,800.00**, B-20260627-0036 at **$4,900.00**, B-20260802-0258 at **$1.00**. Those are the customer-rate/unbased artifacts the instruction warns against.
  The three reissues price correctly, and I recomputed each rather than trusting the stored total:
  | bill | driver | miles | basis | rate | gross | check |
  |---|---|---|---|---|---|---|
  | B-20260616-0120-R1 | GERARDO URBINA | 2,000 | **short** | 48¢ | 96,000¢ = **$960.00** | 2000 × 48 = 96,000 ✓ |
  | B-20260627-0036-R1 | Fernando Mecor Hernandez | 2,200 | **short** | 48¢ | 105,600¢ = **$1,056.00** | 2200 × 48 = 105,600 ✓ |
  | B-20260802-0258-R1 | Juan USMCA-Battery | 2,300 | **short** | 48¢ | 110,400¢ = **$1,104.00** | 2300 × 48 = 110,400 ✓ |
  **All three tie to the cent.** `miles_basis_type = 'short'` on every one, satisfying the shortest-miles requirement. Two of the three drivers are exactly the two named in the instruction, and they are precisely the two holding real `is_test_data=false` 48¢ rate cards (LV-058).
  **Cross-check against the rate cards: 0 mismatches.** Joining every driver bill to its driver's active `driver_pay_rates` row, the count of bills whose `rate_per_mile_cents` differs from the active card is **0**. No bill is priced off a stale or test rate.
  **Void-not-delete respected.** The three mispriced originals are `status='void'` and still present — not deleted — with the corrected bills issued as explicit `-R1` revisions carrying the same `load_id`. That is the correct remediation shape for a money artifact, and it is what makes the before/after independently auditable, which is how I was able to verify it at all.
  This corroborates the live Scenario Tracker, which reports *"2 driver bill(s) priced from the rate card, not the customer rate"* for TRANSP — exactly the two TRANSP reissues here (the third is USMCA and correctly outside that entity's scope).
  Settlements themselves remain empty (`driver_settlements` 0 live), which is expected state: nothing operational has been created in the TMS.
- severity:  informational — a PASS on a rule the owner specified explicitly
- LANE:      none — GUARD attestation. Confirms a Hop 0 precondition rather than raising a defect.
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. `driver_finance.driver_bills` 6 rows enumerated above with `bill_number`, `status`, `gross_amount_cents`, `miles_basis`, `miles_basis_type`, `rate_per_mile_cents`, driver name and `operating_company_id`. Rate-card cross-check: bills whose `rate_per_mile_cents` differs from the driver's active `driver_pay_rates.rate_per_mile_cents` = **0**. Arithmetic recomputed independently per row.
- status:    OPEN (informational)

## LV-062  Two OPEN driver bills totalling $2,016.00 are payable against loads that no longer exist operationally — one CANCELLED, one SOFT-DELETED three weeks ago. Also: the voided originals prove driver pay was being set to the CUSTOMER LINEHAIL, which the driver model forbids.
- module:    dispatch ↔ driver_finance (GUARD live-verify-after-merge, pass 12)
- entity:    TRANSP
- surface:   `driver_finance.driver_bills` ↔ `mdata.loads`
- observed:  **Linkage itself is excellent** — `bills_orphan_load` = **0** (no bill points at a non-existent load), bill numbers mirror load numbers (`B-20260616-0120` ↔ `L-20260616-0120`), and `l.assigned_primary_driver_id = db.driver_id` is **true on all 6 bills**. Forward and reverse both resolve.
  **The defect is lifecycle, not linkage. Two `open` bills sit on dead loads:**
  | bill | amount | load | load state |
  |---|---|---|---|
  | `B-20260616-0120-R1` | **$960.00** | L-20260616-0120 | **`cancelled`** |
  | `B-20260627-0036-R1` | **$1,056.00** | L-20260627-0036 | **soft-deleted 2026-07-13T21:45:26.921Z** |
  Combined exposure **$2,016.00**, and neither carries a `settled_in_settlement_id` — both are live, unsettled payables. This is precisely the class ACCT-F70 / WIRE-10 (PR #4339, *"cancelling a load left its invoice and driver bill alive"*) was merged to close. Its presence here means either that fix does not remediate rows that pre-date it, or the **soft-delete** path is not covered by it at all — only the explicit `cancelled` status is. The soft-deleted case is the more serious of the two: that load disappeared from operations three weeks ago and a $1,056.00 driver payable outlived it, invisible to anyone browsing loads.
  **Separately — and this is the stronger corroboration — the three VOIDED originals prove the defect the driver model exists to prevent.** Each was priced at *exactly* the customer linehaul on its load:
  | voided bill | gross | load `rate_total_cents` | identical? |
  |---|---|---|---|
  | B-20260616-0120 | 580,000¢ | 580,000¢ | **yes** |
  | B-20260627-0036 | 490,000¢ | 490,000¢ | **yes** |
  | B-20260802-0258 | 100¢ | 100¢ | **yes** |
  Driver pay was being set equal to the gross customer rate. The locked driver model is explicit that drivers are hired Mexican-B1 1099 contractors, so driver pay is a wage/fee and **never** a share of the customer linehaul, which is company revenue. The `-R1` reissues correct this to 48¢ × short miles (LV-061). So the original defect and its remediation are now both independently proven on live data, which is what makes the remaining lifecycle gap worth fixing rather than assuming closed.
- severity:  major ($2,016.00 of live unsettled driver payables attached to a cancelled and a deleted load; a merged fix does not cover this case)
- LANE:      CC-1 (money) — extend the ACCT-F70 / WIRE-10 cancellation cascade to cover `soft_deleted_at` as well as `status='cancelled'`, and decide whether it should remediate pre-existing rows or only new ones. Voiding these two bills is a money action and is not mine to take.
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. `driver_bills` joined to `mdata.loads`: orphan load references **0**; `driver_matches` true on all 6; open bills on cancelled-or-soft-deleted loads **2**, summed exposure **201,600¢**, both with `settled_in_settlement_id` NULL. Voided originals' `gross_amount_cents` compared against their load's `rate_total_cents`: identical on all three. `mdata.loads` totals: 6 rows, 4 live, statuses `assigned_not_dispatched` 2 / `cancelled` 1 / `completed_docs_received` 1 — all test loads, consistent with nothing operational having been created in the TMS.
- status:    OPEN

## LV-063  **RETRACTED** — I claimed BANK-F10 was falsely PASS because $316.34 of fuel overage showed no deduction. The origin test disproves it: all 3 rows are Relay IMPORTS and settlements have never run, so the absent deduction is expected state
- module:    fuel / driver_finance (GUARD live-verify-after-merge, pass 13)
- entity:    TRANSP
- surface:   `fuel.fuel_transactions` · `fuel.fuel_card_overage_events` · every `*deduction*` table
- observed:  `docs/module-completion/banking.json` carries **BANK-F10 — "Fuel-card overage never recovered from the driver (company silently eats every…)" — status PASS**. The live data does not support that PASS.
  **What exists.** Three fuel transactions carry an `overage_event_id` and a non-zero `overage_recovered_cents`, totalling **31,634¢ = $316.34**:
  | fuel txn | date | fuel cost | "recovered" | `overage_deduction_id` |
  |---|---|---|---|---|
  | `fa826c61…` | 2026-05-02 | $986.94 | 8,694¢ | **NULL** |
  | `99798432…` | 2026-05-03 | $985.66 | 8,566¢ | **NULL** |
  | `1f016625…` | 2026-05-20 | $1,043.74 | 14,374¢ | **NULL** |
  All three have a driver attached, so the counterparty is known. `fuel.fuel_card_overage_events` holds 3 rows and `fuel_card_overage_policies` 3, so detection and policy both work. `catalogs.driver_deduction_types` holds 23 configured types.
  **What does not exist — and this is the finding.** `overage_deduction_id` is **NULL on all three**, and **every deduction table in the system is empty**: `driver_settlement_deductions` **0 live** (14 inserted historically, all since removed), `driver_deduction_buckets` 0, `driver_deduction_bucket_events` 0, `deduction_schedule` 0, `auto_deduction_policies` 0, `escrow_deductions_pending` 0, `settlement.settlement_deduction` 0. `driver_settlements` is likewise 0 live, so no settlement has ever netted it either.
  **So the $316.34 was never recovered.** `overage_recovered_cents` is a number written onto the fuel row; there is no deduction artifact, no settlement line, no escrow entry and no GL posting behind it. The company still ate the overage — which is exactly what BANK-F10's own title describes as the defect. The item passes because a field is populated, not because money moved.
  **This is the same shape as LV-047**, where BANK-ECON-04 passes on a "zero-diff closure" that compares $0.00 to $0.00. Both are acceptance items satisfied by the presence of a value rather than by the property the value is supposed to evidence. It is also the recurring status-without-artifact pattern in this file: LV-010 (queue rows claiming `sent` with a console stub), LV-013 (invoice `sent` with no queue row), LV-049 (a contract `signed_electronically` with no signed PDF), LV-026 (an "immutable" audit trail with no WORM store).
  **Honest scope.** Driver settlements have never run (0 rows), and nothing operational has been created in the TMS, so it is entirely possible the intended design is that recovery happens at settlement time and simply has not run yet. If so, `overage_recovered_cents` is being set **prematurely** — it asserts a completed recovery before the deduction exists — and that is still the defect, just relocated from "never recovers" to "claims recovery it has not performed". Either way BANK-F10 cannot be evidenced as PASS today.
  **RETRACTED — I got this wrong, and the origin test I am supposed to run every time is what disproves it.** All three overage rows are **Relay-bridge IMPORTS, not TMS-created events**: `source='other'`, `imported_at` NOT NULL, `created_by_user_id` NULL, and `notes` reading `relay_bridge=1; relay_txn=…; merchant=Love's`. In fact **all 1,548 rows in `fuel.fuel_transactions` are imported** — there is not one TMS-created fuel event. The owner has stated three times that nothing operational has been created in this TMS: no loads, no dispatch, no maintenance, no safety events; the transactions are QuickBooks and Relay imports.
  So the absence of a deduction is **EXPECTED STATE, not a defect**. No `driver_settlement_deductions` row exists because **no settlement has ever run**, and no settlement has run because nothing operational exists to settle. Recovery of a fuel-card overage happens at settlement time; settlements are at zero; therefore no recovery. **BANK-F10's PASS is not contradicted by this evidence and I withdraw that claim.**
  **What remains, stated narrowly and honestly:** `overage_recovered_cents` is non-zero (31,634¢) on rows where no deduction exists. Whether that is wrong depends on the field's intended semantics — "amount actually recovered" versus "amount computed as recoverable" — which I did **not** establish. If it means the former it is premature; if the latter it is correct. **UNVERIFIED — needs the field's definition**, and I am not guessing it. This is a labelling question on imported data, not a money defect, and it is not evidence against BANK-F10.
- severity:  informational — RETRACTED from major. The original claim (money never recovered) mistook expected state on imported data for a defect.
- LANE:      CC-1 (money/fuel) — either wire the overage to a real `driver_settlement_deductions` row, or stop writing `overage_recovered_cents` until a deduction exists. The BANK-F10 Status column belongs to whoever owns `banking.json`; I do not edit it.
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. Fuel txns with `overage_event_id` NOT NULL = **3**, summed `overage_recovered_cents` = **31,634¢**, unrecovered (NULL or 0) = **0**, `overage_deduction_id` NULL on all 3, driver attached on all 3. `fuel.fuel_card_overage_events` 3, `fuel_card_overage_policies` 3, `catalogs.driver_deduction_types` 23. Deduction tables `n_live_tup`: `driver_settlement_deductions` 0 (`n_tup_ins` 14), `driver_deduction_buckets` 0, `driver_deduction_bucket_events` 0, `deduction_schedule` 0, `auto_deduction_policies` 0, `escrow_deductions_pending` 0, `settlement.settlement_deduction` 0; `driver_finance.driver_settlements` 0 live.
- status:    OPEN

## LV-065  GUARD passes 15–16 — the ledger balances to zero on EVERY dimension: whole-ledger net 0¢, and all 12 source types net 0¢ independently; intercompany transfers carry correct reciprocal legs across TRANSP↔USMCA
- module:    accounting / banking (GUARD live-verify-after-merge, passes 15–16)
- entity:    ALL
- surface:   `accounting.journal_entry_postings` · `banking.transfers`
- observed:  **PASS 16 — double-entry integrity, decomposed.** LV-050 proved every one of 1,787 journal entries balances individually. This decomposes the same ledger a second, independent way — by source type — and it holds everywhere:
  | source type | postings | net |
  |---|---|---|
  | `fuel_event` | 3,094 | **0¢** |
  | `bank_categorization` | 380 | **0¢** |
  | (untyped) | 82 | **0¢** |
  | `bill` | 10 | **0¢** |
  | `invoice` | 10 | **0¢** |
  | `transfer` | 8 | **0¢** |
  | `prepaid_purchase` | 4 | **0¢** |
  | `fixed_asset_depreciation` | 4 | **0¢** |
  | `expense` | 4 | **0¢** |
  | `loan_payment` | 3 | **0¢** |
  | `bill_payment` | 2 | **0¢** |
  | `customer_payment` | 2 | **0¢** |
  **Whole-ledger net: 0¢.** Not one source type carries a residual, including the 82 untyped postings that hold the opening balance. Two independent decompositions — per journal entry (LV-050) and per source type (here) — both return zero, so the balance property is not an artifact of how the ledger is sliced.
  **PASS 15 — intercompany transfers are structurally correct.** `banking.transfers` holds 4 rows, **all 4 posted**, none revoked. The one intercompany group `e8ea4c5c-5378-49fd-8327-3b5d6287433a` carries exactly **2 legs** with distinct roles (`initiator` + `counterparty`) spanning **two entities** — TRANSP `91e0bf0a…` and USMCA `5c854333…` — at $1.00 per leg. The remaining 2 transfers are intra-entity and correctly carry no group. All 8 transfer postings net **0¢**. That is the reciprocal-leg model BANK-DOM-05 describes, verified live rather than assumed from its PASS mark.
  Recording these affirmatively because the failures in this file are easier to find than the passes, and a reader needs to know which properties actually hold. The ledger's arithmetic is sound; the defects I have filed are about *what reaches* the ledger (LV-064 poster denylists), *what is recorded about it* (LV-057 unaudited posting lines), and *how it is presented* (LV-018/024/029/032/034), not about the double-entry itself.
- severity:  informational — two structural passes, no defect
- LANE:      none — GUARD attestation
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. `accounting.journal_entry_postings` grouped by `source_transaction_type` with signed sums as tabulated; ungrouped whole-ledger signed sum **0**. `banking.transfers`: 4 rows, 4 with a `posted` batch, 0 revoked; group `e8ea4c5c…` = 2 legs, `intercompany_leg` values `initiator,counterparty`, 2 distinct `operating_company_id`s, `SUM(amount_cents)` 200; transfers without a group = 2.
- status:    OPEN (informational)

## LV-066  GUARD pass 17 — chart-of-accounts and posting-target integrity PASS: 176 deactivated accounts and ZERO postings landed on any of them; 0 duplicate account numbers within an entity
- module:    accounting / catalogs (GUARD live-verify-after-merge, pass 17)
- entity:    ALL
- surface:   `catalogs.accounts` ↔ `accounting.journal_entry_postings`
- observed:  **Structure — clean.** `catalogs.accounts` holds **1,442** rows across **3** entities: **1,266 active, 176 deactivated, 0 locked**. Zero rows are missing `account_type`, zero are missing `account_number`, and there are **zero duplicate `account_number`s within an operating company** — the per-entity key holds, which is what makes the repeated numbers across entities (QBO-168, 2000, 1100) correct instancing rather than collisions (LV-030).
  **The control that matters — also clean.** **0 postings** reference a **deactivated** account, and **0** reference a **locked** one. 176 accounts have been deactivated and not a single journal line landed on any of them. Deactivation is therefore enforced at the posting boundary rather than being a UI-only affordance — a real control, verified against a non-trivial population rather than a token one.
  This closes the account-side of the posting question. Combined with LV-065 (every source type nets 0¢) and LV-050 (every journal entry balances), the three legs of ledger integrity — the entries, the amounts, and the accounts they land on — are all independently verified sound.
  **Method note, recorded because it nearly became a false report.** My first pass wrote `count(*) AS deactivated_accounts` with **no FILTER clause**, which returned 1,442 — the total row count — and would have read as "every account is deactivated", a dramatic and completely false finding sitting next to a contradictory "0 postings to deactivated accounts" in the same result set. The internal contradiction is what caught it. Two numbers in one query that cannot both be true is a stronger self-check than either number alone, and I am recording it as a habit worth keeping: when a result implies something extreme, look for a second value in the same output that would have to agree.
- severity:  informational — structural pass, no defect
- LANE:      none — GUARD attestation
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. `catalogs.accounts`: total **1,442**, `deactivated_at IS NOT NULL` **176**, `is_locked` **0**, active **1,266**, `account_type IS NULL` **0**, `account_number IS NULL` **0**, distinct `operating_company_id` **3**; duplicate `(operating_company_id, account_number)` groups **0**. Postings joined to accounts: to deactivated **0**, to locked **0**.
- status:    OPEN (informational)

## LV-067  GUARD passes 18–19 — master-data entity isolation and payment integrity both PASS at real scale: 0 cross-entity customer/vendor references across 5,527 master records, and 0 over-application across 6,544 payments
- module:    accounting / mdata (GUARD live-verify-after-merge, passes 18–19)
- entity:    ALL
- surface:   `mdata.customers` · `mdata.vendors` · `accounting.invoices` · `accounting.bills` · `accounting.bill_payments`
- observed:  **PASS 18 — cross-entity isolation on master data, tested at scale.** `mdata.customers` holds **2,696** rows (2,692 active) across **3** entities; `mdata.vendors` holds **2,831** (2,444 active). Joining money documents to their counterparties:
  - invoices whose `operating_company_id` differs from their customer's: **0**
  - bills whose `operating_company_id` differs from their vendor's: **0**
  This matters more than the equivalent check inside the GL (LV-054, also 0) because it runs against **5,527 real master records and ~28,000 real documents**, not the handful of TMS-native test rows. The standing cross-entity-leak concern is not observable here: no document reaches across the TRANSP / TRK / USMCA boundary to a counterparty that belongs to another entity.
  **PASS 19 — payment over-application, tested at scale.** Across **6,544 bill payments**:
  - payments whose amount exceeds their bill's amount: **0**
  - bills where `paid_cents > amount_cents`: **0** (of 16,250)
  - invoices where `amount_paid_cents > total_cents`: **0** (of 11,983)
  No bill or invoice has been over-applied, and no payment line exceeds the document it settles. Since `amount_open_cents` on invoices is a generated column (`total_cents - amount_paid_cents`), a violation here would have produced negative open balances propagating into AR aging and the $831,073.13 open figure — it has not.
  Recording both affirmatively. These are the invariants an auditor would test first on imported books, and they hold across the full imported population rather than a sample.
- severity:  informational — two structural passes at scale, no defect
- LANE:      none — GUARD attestation
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. `mdata.customers` 2,696 total / 2,692 active / 3 entities; `mdata.vendors` 2,831 total / 2,444 active. Cross-entity joins: invoices↔customers mismatch **0**, bills↔vendors mismatch **0**. `accounting.bill_payments` 6,544 with 0 exceeding their bill; `accounting.bills` unvoided with `paid_cents > amount_cents` **0**; `accounting.invoices` unvoided with `amount_paid_cents > total_cents` **0**.
- status:    OPEN (informational)

## LV-068  GUARD pass 20 — HOS duty-status log is append-only at full scale: 592,535 records with ZERO updates and ZERO deletes. This is the tamper-evidence property a DOT/FMCSA reviewer tests first, and it holds.
- module:    hos / safety (GUARD live-verify-after-merge, pass 20)
- entity:    ALL
- surface:   `hos.duty_status_events` · `safety.*`
- observed:  `hos.duty_status_events` holds **592,535 live rows** (`n_tup_ins` 594,504) with **`n_tup_upd` = 0** and **`n_tup_del` = 0**. Over half a million driver duty-status records have been written and **not one has ever been modified or removed**.
  **Why this is the most consequential append-only result in this file.** The other WORM checks protect the company's own books — `audit.audit_events` and `audit.row_changes` (LV-054, 4.5M rows, also 0/0). This one protects a **legally mandated record**. Hours-of-service logs are the primary artifact in a DOT/FMCSA audit and in any accident or hours-falsification proceeding; their evidentiary value depends entirely on being unalterable after the fact. A single UPDATE on this table would compromise the defensibility of the whole log, and there have been none across 592,535 rows.
  This also independently corroborates the schema rule that `hos.duty_status_events` is append-only — that is not merely documented, it is observably true in production at scale.
  **Safety surfaces, for the record:** `safety.driver_safety_scores` 409, `safety.fuel_gps_matches` 176, `safety.integrity_alerts` 30 with `integrity_alert_events` 30 (one historical delete), `document_alert_rules` 21, `anomaly_alert_rules` 18. Modest volumes, consistent with the safety module being configured and partially exercised while nothing operational has been created in the TMS. **I am not filing the low counts as a gap** — per the origin rule, absence of operational activity is expected state, and the one `integrity_alert_events` delete is undated historical churn on a non-financial table.
- severity:  informational — a structural pass with regulatory significance
- LANE:      none — GUARD attestation
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. `pg_stat_user_tables` for `hos.duty_status_events`: `n_live_tup` **592,535**, `n_tup_ins` 594,504, `n_tup_upd` **0**, `n_tup_del` **0**. Safety schema counts as listed, all `n_tup_del` 0 except `integrity_alert_events` (1).
- status:    OPEN (informational)

## LV-069  GUARD pass 21 — fleet/asset entity model PASS: 182 units all carry an owner, 52 leased out, ZERO self-leases; the TRK-owns/TRANSP-leases split holds on the correct columns
- module:    fleet / mdata (GUARD live-verify-after-merge, pass 21)
- entity:    ALL
- surface:   `mdata.units` · `mdata.drivers`
- observed:  `mdata.units` holds **182** rows. **All 182 carry an `owner_company_id`** — no unit is orphaned from an owning entity — and **52** carry a `currently_leased_to_company_id`, i.e. are currently leased out. **Zero units are leased to their own owner** (`currently_leased_to_company_id = owner_company_id` → 0), so the lease relation never degenerates into a self-reference that would double-count an asset or make an entity appear to lease from itself.
  This is the multi-entity asset model working as specified: **TRK owns the equipment; TRANSP/USMCA lease it.** Ownership and leasehold are tracked on the two purpose-built columns — `owner_company_id` and `currently_leased_to_company_id` — and **not** on `operating_company_id`, which does not exist on this table and whose assumed presence is a documented recurring source of 500s. The live data confirms the documented model rather than the mistaken one.
  `mdata.drivers` holds **179** rows, **88 active** (`deactivated_at IS NULL AND archived_at IS NULL`), consistent with the 86 TRANSP-active figure measured against contract instances in LV-049 (the difference being other entities).
  Recorded as a pass because asset ownership is the foundation of the lease accounting, depreciation and insurance chains; if units were orphaned or self-leased, every downstream allocation built on them would inherit the error.
- severity:  informational — structural pass, no defect
- LANE:      none — GUARD attestation
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. `mdata.units`: total **182**, `owner_company_id IS NOT NULL` **182**, `currently_leased_to_company_id IS NOT NULL` **52**, rows where `currently_leased_to_company_id = owner_company_id` **0**. `mdata.drivers`: total **179**, active **88**.
- status:    OPEN (informational)

## LV-071  GUARD passes 23–40 — 18 further passes across every remaining schema. Referential integrity holds at 155K+ scale; USDOT gap CLOSED; three new gaps found: IFTA/SCAC missing on all 3 entities, 24 documents with no link or category, and a "signed" contract with neither PDF nor signature record
- module:    cross-module (GUARD live-verify-after-merge, passes 23–40)
- entity:    ALL
- surface:   `banking` · `accounting` · `mdata` · `docs` · `org` · `identity` · `legal` · `insurance` · `maintenance` · `events` · `integrations`
- observed:  Eighteen passes completing the sweep to 40. **Referential integrity is clean everywhere it was tested, including at real scale.**
  | # | pass | result |
  |---|---|---|
  | 23 | bank account ↔ ledger bind | 17 accounts, **0** live unbound, **0** orphan binds |
  | 24 | invoice lines → invoices | 7 lines, **0** orphans |
  | 25 | bill lines → bills | **155,274** lines, **0** orphans |
  | 26 | payments → customers | **12,124** payments, **0** orphan customers |
  | 27 | QBO sync queue | 9 rows: 7 `synced`, **2 `dead_letter`** |
  | 28 | insurance | `type_catalog` 45; `policy_unit`/`coi_request`/`payment_schedule` all 0 — configured, unused |
  | 29 | legal | `contract_templates` 69, `contract_audit_log` 30, `contract_instances` 1, **`signatures` 0** |
  | 30 | maintenance | `pm_auto_wo_log` 33,216 (7,854 del), `pm_schedule_runs` 3,890, `parts_inventory` 144, `pm_schedules` 24 (12 del) |
  | 31 | load stops → loads | 12 stops, **0** orphans |
  | 32 | events | `events.event_log` 1,354, **`n_tup_del` 0** — append-only holds |
  | 33 | identity | 25 users, 15 active |
  | 34 | org structure | 3 companies: USMCA Freight, IH 35 Transportation, IH 35 Trucking |
  | 35 | access control | 13 grants, 11 users, 3 companies, all active, **0 orphans** |
  | 36 | USDOT registration | **0 missing — a previously recorded owner data gap is now CLOSED** |
  | 37 | fixed-asset depreciation | 4 postings, nets 0¢ (LV-065) |
  | 38 | compliance identifiers | **1 missing MC, 3 missing IFTA, 3 missing SCAC** |
  | 39 | document store | 24 files, all uploads complete, **16 of 24 hashed**, **0 linked to a load, 0 categorised** |
  | 40 | document integrity | **0** orphan load references |
  **CLOSED — USDOT.** All three operating companies now carry a `usdot_number`. This was on record as an owner data gap blocking a module; it is resolved and I am recording the closure with evidence so nobody re-opens it.
  **NEW GAP 1 — IFTA and SCAC missing on every entity.** `ifta_license_number` is NULL on **all 3** companies and `scac_code` is NULL on **all 3**; `mc_number` is NULL on 1. For a carrier running Laredo↔Mexico, the IFTA licence is not cosmetic — it is the registration under which interstate fuel tax is reported, and the system already holds 1,548 fuel transactions and a fuel-tax filing checklist item in the month-close wizard. SCAC is required for EDI and customer onboarding. These are **owner data-entry items, not code defects**.
  **NEW GAP 2 — 24 documents are unlinked and uncategorised.** `docs.files` holds 24 rows, all with `upload_completed_at` set, but **`dispatch_load_id` NULL on all 24** and **`category_id` NULL on all 24**; `docs.file_links` has never been written (`n_tup_ins` 0). So every uploaded document floats free of any load, entity record or category. **0 carry a dangling load reference**, so nothing is broken — they are simply attached to nothing, which for an evidence store (POD/BOL, insurance certificates, driver files) means the documents exist but cannot be found from the records they belong to. Also **only 16 of 24 carry a `sha256_hash`**, so a third of the store lacks the integrity digest that makes a document defensible as evidence.
  **NEW GAP 3 — the one "signed" contract has no signature record either.** LV-049 found `legal.contract_instances` holding a single row marked `signed_electronically` with `signed_pdf_attachment_id` NULL. Pass 29 adds that **`legal.signatures` is entirely empty (0 rows)**. So that contract has a status asserting execution, no signed PDF, and no signature record — three independent places where the evidence should exist and does not. This strengthens LV-049 from "missing artifact" to "no execution evidence of any kind", on the control that gates escrow forfeiture.
  **Also noted, not filed:** 2 `dead_letter` rows in the QBO sync queue (small, but they are failures parked with no alerting — same family as LV-027/LV-053); and `maintenance.pm_auto_wo_log` carries 7,854 deletes against 33,216 live rows, which is log churn on a non-financial table rather than a void-not-delete violation.
- severity:  major (three concrete gaps: statutory identifiers, an unlinked evidence store, and a contract with no execution evidence) — all other passes clean
- LANE:      OWNER for IFTA/SCAC/MC data entry · CURSOR/CC-1 for document linking + hashing · CC-1 for the legal signature chain
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. Counts exactly as tabulated. `org.companies` 3 with `usdot_number` NULL **0**, `mc_number` NULL 1, `ifta_license_number` NULL 3, `scac_code` NULL 3. `docs.files` 24 total / 24 live / 24 `upload_completed_at` / 16 `sha256_hash` / 0 `dispatch_load_id` / 0 `category_id`; `docs.file_links` `n_tup_ins` 0; orphan load refs 0. `legal.signatures` 0. `org.user_company_access` 13 rows, 0 orphaned against `identity.users` or `org.companies`.
- status:    OPEN

## LV-072  GOVERNANCE DRIFT — the standards skill indexes 32 `.cursor/rules` files; there are **41**. Nine are undocumented, including Rule 32 (continuous mode) and Rule 35 (no CI babysit) — two rules I was actively violating because they were not in the index I had read.
- module:    governance / session-boot
- entity:    N/A
- surface:   `.claude/skills/ih35-tms-standards` §11 vs `.cursor/rules/*.mdc`
- observed:  §11 of the standards skill states **"COUNTED 2026-08-03: 32 files"** and instructs, in the same paragraph, **"Never trust this count: run `ls .cursor/rules/*.mdc | wc -l` and reconcile against this list at session start."** I ran it. The actual count is **41**.
  **Nine files are absent from the index:** `00-operating-method-LAW`, `31-cursor-never-idle-wave-drain`, `31-full-system-audit-mandatory`, `32-continuous-mode-no-idle`, `32-load-linkage-pre-operational`, `33-standing-session-directive`, `34-cursor-pr-title-prefix`, `35-fix-failures-no-ci-babysit`, `ih35-deep-linkage-audit`.
  **This is not academic — I was violating two of them.** The skill's own §11 predicts precisely this: *"That is exactly how an agent violates a live rule while believing it had read them all."*
  - **Rule 35 — FIX FAILURES, DO NOT BABYSIT CI** hard-bans `gh pr checks --watch`, long watch loops, and multi-turn "waiting for green" as a primary activity. I had been running merge-on-green polling loops on every PR this session. Killed on discovery.
  - **Rule 32 — CONTINUOUS MODE** forbids ending a turn on "waiting for CI" and requires the next action to start in the same turn. I had repeatedly closed turns on PR status.
  Both were invisible to me because I had read the index rather than the directory. The index is a *summary of the law*, and the skill says outright: **"A summary of the law is not the law."**
  **Two of the nine also matter to work already recorded in this file.** `32-load-linkage-pre-operational` is the codified owner ruling that imported fuel/expense rows are legitimately `load_id`-null — the exact law under which I retracted LV-063. `31-full-system-audit-mandatory` sets the completion bar at DoD A–E + VERIFY 1–8 **PROD-VERIFIED per entity**, which is the standard the 40 GUARD passes in this file are measured against.
  **The numbering also repeats more than §11 records.** §11 documents 21, 23 and 25 as duplicated numbers; the directory shows **31 and 32 are duplicated as well** (`31-cursor-never-idle-wave-drain` / `31-full-system-audit-mandatory`, and `32-continuous-mode-no-idle` / `32-load-linkage-pre-operational`). Counting by number rather than by file therefore under-counts by more than the index admits.
- severity:  major (governance — an agent reading only the index will violate live, always-apply rules, as I did)
- LANE:      whoever owns `.claude/skills/ih35-tms-standards` — the skill lives in the sibling clone `/Users/jorgemunoz/IH35-TMS-clean`, outside my working tree, so I am **not** editing it. Routing the correction rather than making it.
- neon-check: none — repository-level governance finding. `ls .cursor/rules/*.mdc | wc -l` → **41** at main `272a59bf6`; full filename list enumerated above; both Rule 32 and Rule 35 read in full and confirmed `alwaysApply: true`.
- status:    OPEN

## LV-073  Rule 31 per-entity verification — all 3 entities balance independently (0¢ each), and the per-entity split sharpens LV-051: **TRK holds 13,051 of 16,250 bills (80%) against a 13-posting ledger**, and issues ZERO invoices
- module:    accounting (GUARD — Rule 31 per-entity bar)
- entity:    TRANSP · TRK · USMCA
- surface:   `accounting.journal_entries` · `accounting.invoices` · `accounting.bills` · `banking.bank_transactions` · `catalogs.accounts`
- observed:  Rule 31 sets completion at **PROD-VERIFIED per entity**, and my earlier passes were TRANSP-weighted. Decomposing every prior aggregate by entity:
  **Ledger balance — each entity balances on its own, not merely in aggregate:**
  | entity | entries | postings | net |
  |---|---|---|---|
  | TRANSP | 1,769 | 3,566 | **0¢** |
  | USMCA | 12 | 24 | **0¢** |
  | TRK | 6 | 13 | **0¢** |
  This is a stronger result than LV-050's whole-ledger proof: a cross-entity imbalance could in principle cancel in aggregate, and it does not — each entity's books close independently.
  **Document population by entity:**
  | entity | invoices (QBO / TMS) | bills (of which QBO-cloned) | bank txns | CoA accounts |
  |---|---|---|---|---|
  | TRANSP | 11,979 (11,976 / 3) | 3,196 (3,195) | 6,012 | 404 |
  | **TRK** | **0** | **13,051 (13,050)** | 4,835 | **958** |
  | USMCA | 4 (0 / 4) | 3 (0) | 160 | 80 |
  **Two findings fall out of the split.**
  1. **TRK carries 80% of all accounts payable** — 13,051 of 16,250 bills — against a ledger holding **6 journal entries and 13 postings**, and it holds the **largest chart of accounts** (958, more than double TRANSP's 404) despite the least GL activity. That is coherent for an asset holder absorbing a large imported QuickBooks history, but it means **LV-051's A/P tie-out was measured across mixed entities**: the $4.27M gap between GL `ap_control` and the bills subledger is overwhelmingly TRK's imported payables sitting against a near-empty TRK ledger, not a TRANSP condition. The conclusion of LV-051 is unchanged — the gap is expected under parallel books — but its **location** is now precise, and any future tie-out must be run per entity or it will keep reporting a number that belongs to a different company.
  2. **TRK issues zero invoices.** Not a small number — none at all. That is exactly correct for an entity that owns and leases equipment rather than hauling freight, and it independently corroborates the standing ruling that TRK does not factor and leases equipment only. Recording it as a **PASS**, since a single TRK customer invoice would contradict the entity model.
  **USMCA is entirely TMS-native**: all 4 invoices and all 3 bills carry no QBO origin. So the test entity is the one place where the go-forward path is exercised without imported history mixed in — which is why the invoice→GL→email chain proved out there and on TRANSP (LV-058) rather than on TRK.
- severity:  informational — per-entity PASS; sharpens LV-051's scope
- LANE:      none — GUARD attestation. Note for CC-1: run control-account tie-outs **per entity**, never aggregated.
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. Journal entries joined to postings grouped by `operating_company_id`: TRANSP 1,769/3,566/0¢, USMCA 12/24/0¢, TRK 6/13/0¢. Unvoided invoices by entity with `source_system` split, unvoided bills by entity with `qbo_bill_id` split, unvoided `banking.bank_transactions` by entity, and `catalogs.accounts` by entity — all as tabulated. Totals reconcile: bills 3,196+13,051+3 = 16,250; invoices 11,979+4 = 11,983; accounts 404+958+80 = 1,442.
- status:    OPEN (informational)

## LV-074  GUARD — locked invariants verified at 100%: `security_invoker=true` on 40 of 40 views, FORCED RLS on every money-schema table (190 of 190). The 4 `catalogs` tables without RLS are shared-canonical reference data — EXPECTED STATE, not a defect.
- module:    accounting / catalogs / platform (GUARD live-verify-after-merge)
- entity:    ALL
- surface:   `pg_class` view options and RLS flags across the money schemas
- observed:  Two §2 locked invariants, both verified live rather than assumed from the spec.
  **`security_invoker=true` on every view — 40 of 40 PASS.** `views` schema **39 of 39**, `accounting` **1 of 1**. No view runs with definer rights, so none can silently bypass the RLS of the caller reading through it. *(Method note: my first query searched the view **definition text** for `security_invoker` and returned 0 — the wrong place. The option lives in `pg_class.reloptions`, not the SQL body. Running both is what caught it; a single query would have produced a false "0 of 40 compliant" alarm.)*
  **FORCED RLS on the money schemas — 190 of 190 PASS:**
  | schema | tables | RLS on | FORCED |
  |---|---|---|---|
  | accounting | 85 | **85** | **85** |
  | mdata | 50 | **50** | **50** |
  | driver_finance | 37 | **37** | **37** |
  | banking | 12 | **12** | **12** |
  | fuel | 5 | **5** | **5** |
  | hos | 1 | **1** | **1** |
  | catalogs | 115 | 111 | 111 |
  | lib | 2 | 2 | **1** |
  Every table in `accounting`, `mdata`, `banking`, `driver_finance`, `fuel` and `hos` has row-level security **enabled and FORCED** — forced matters because without it the table owner bypasses the policy entirely.
  **The 4 `catalogs` tables without RLS are correctly excluded, and I classified before filing.** §0 requires scoping to be judged by opco values and policy rather than column presence. **None of the four has an `operating_company_id` column at all**: `audit_event_types` (13 rows, event-type enum), `cancellation_reasons` (9 rows — the **legacy** table §10 rules must be archived and never dropped, superseded by `catalogs.load_cancellation_reasons`), `equipment_types_dedup_ledger_0318` (2 rows, a migration dedup artifact), `tax_form_thresholds` (8 rows, statutory thresholds). These are shared-canonical reference data with no per-entity dimension — RLS would have nothing to scope on, and adding it would be meaningless. **Reporting "4 catalogs tables missing RLS" would have been a false finding**; the classification rule is what prevented it.
  **One genuine asymmetry, recorded not filed:** `lib` has 2 RLS-enabled tables but only **1 FORCED** — `lib.feature_flags` is `relforcerowsecurity=false` while `lib.feature_flag_overrides` is forced. That is consistent with what LV-036 measured (the flag row is visible to the runtime role while the override row is not) and is not itself the LV-036 defect, which lives in the check route's missing entity GUC.
- severity:  informational — two locked invariants at 100%; no defect
- LANE:      none — GUARD attestation
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. Views by schema with `reloptions ILIKE '%security_invoker=true%'`: `views` 39/39, `accounting` 1/1. `pg_class.relrowsecurity` / `relforcerowsecurity` by schema exactly as tabulated. Money-schema tables (`accounting`,`catalogs`,`mdata`,`banking`) without RLS = **4**, all in `catalogs`, each confirmed to have **0** `operating_company_id` columns via `information_schema.columns`.
- status:    OPEN (informational)

## LV-075  ROOT CAUSE of the empty Scenario Tracker (and therefore of the P0 homepage crash): **`ih35_app` has no INSERT privilege on `audit.scenario_status`.** The certifier cannot write it — it is not that it never ran. Also: WORM is enforced by GRANT, not merely observed.
- module:    accounting / platform (GUARD live-verify-after-merge)
- entity:    ALL
- surface:   table privileges on `audit.*` and `events.*`
- observed:  LV-056 recorded that `audit.scenario_status` is empty (0 rows, lifetime 1 insert / 1 delete) and that the empty payload crashed `/home` via an unguarded spread. I attributed the emptiness to the certifier never having run. **That was incomplete — the runtime role is not permitted to write the table at all.**
  **Effective privileges for `ih35_app`:**
  | table | SELECT | INSERT | UPDATE | DELETE |
  |---|---|---|---|---|
  | `audit.audit_events` | ✓ | ✓ | **✗** | **✗** |
  | `audit.row_changes` | ✓ | ✓ | **✗** | **✗** |
  | **`audit.scenario_status`** | ✓ | **✗** | ✗ | ✗ |
  | `events.event_log` | ✓ | **✗** | ✗ | ✗ |
  Schema `USAGE` is granted on both `audit` and `events`, so this is a table-level grant gap, not a schema-level one — which is exactly the failure §2 warns about: *"new schema → add GRANTs … or it 500s at runtime."* Here it does not 500; it fails silently, leaving an empty table that reads as "not yet certified".
  **So the causal chain behind the P0 is one link longer than I first recorded:** missing INSERT grant → certifier cannot persist → `audit.scenario_status` empty → tracker payload omits `scenarios` → unguarded spread in `ScenarioTrackerPanel` → `TypeError` → entire owner homepage down. The panel fix (PR #4368) correctly stops the crash, but **the tracker will stay permanently empty until this grant is added**, so LV-056's remaining half is now precisely actionable rather than "CC-1 to investigate".
  **Method note — two privilege views disagree, and only one is authoritative.** `information_schema.role_table_grants` reports `ih35_app` holding **only SELECT** on *both* `scenario_status` and `audit_events`, which would wrongly suggest the audit tables are unwritable too. `has_table_privilege()` returns **INSERT true for `audit_events`** and **false for `scenario_status`**. The difference is that `role_table_grants` lists only *direct* grants while `has_table_privilege` resolves *effective* privilege including role inheritance. **Effective privilege is what the runtime actually experiences**, so it is the one to test; reading the grants view alone would have produced a false finding that the audit log is unwritable.
  **The same check yields a genuine PASS worth stating: WORM is enforced, not merely observed.** `audit.audit_events` and `audit.row_changes` both grant INSERT but **explicitly deny UPDATE and DELETE** to the runtime role. LV-054 measured `n_tup_upd = 0` and `n_tup_del = 0` across 4.5M rows; this shows that is not luck or discipline — **the runtime role is structurally incapable of mutating those rows**. `events.event_log` is even stricter (SELECT only), consistent with its 1,354 rows and 0 deletes.
- severity:  major (identifies the actionable root cause behind a P0; the Scenario Tracker cannot function until fixed)
- LANE:      CC-1 (platform) — `GRANT INSERT ON audit.scenario_status TO ih35_app` (plus DEFAULT PRIVILEGES if the certifier also updates/supersedes rows). Verify afterwards that a certifier run actually persists a row; the grant alone is necessary, not sufficient.
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. `has_table_privilege('ih35_app', …)` per table exactly as tabulated. `has_schema_privilege('ih35_app','audit','USAGE')` **true**, `('events','USAGE')` **true**. `information_schema.role_table_grants` for `audit.scenario_status` and `audit.audit_events` both show grantee `ih35_app` with `SELECT` only — direct grants, which is why they disagree with the effective-privilege result.
- status:    OPEN

## LV-076  Seven tables deny INSERT to the runtime role — three are correct WORM/reference protection, but **`catalogs.ifta_states` (0 rows) and `driver_finance.settlement_disputes` (0 rows) are empty AND unwritable**, so those features cannot ever populate
- module:    platform / catalogs / driver_finance (GUARD live-verify-after-merge)
- entity:    ALL
- surface:   effective `INSERT` privilege for `ih35_app` across 20 schemas
- observed:  Extending LV-075 from 2 schemas to **20**, exactly **7** tables deny INSERT to the runtime role. They split into three distinct classes, and only one class is a defect:
  | table | rows | verdict |
  |---|---|---|
  | `events.event_log` | **1,361** | **CORRECT** — append-only WORM, written by a privileged path; newest row `2026-08-05T11:00:00Z`, so it is actively being written |
  | `reference.ifta_tax_rates` | 96 | **CORRECT** — seeded statutory reference data, app must not mutate |
  | `reference.non_ifta_jurisdictions` | 3 | **CORRECT** — same class |
  | `catalogs.tax_form_thresholds` | 8 | **CORRECT** — seeded statutory thresholds |
  | **`audit.scenario_status`** | **0** | **DEFECT** — LV-075; the certifier cannot write, so the Scenario Tracker is permanently empty |
  | **`catalogs.ifta_states`** | **0** | **DEFECT (new)** — empty *and* unwritable |
  | **`driver_finance.settlement_disputes`** | **0** | **DEFECT (new)** — empty *and* unwritable |
  **The discriminator is rows-versus-writability, and it is what separates protection from paralysis.** A table that is unwritable *and populated* is deliberate protection: the data was seeded by a privileged path and the application is correctly barred from altering it — that is `events.event_log` (still receiving rows today), the two `reference.*` IFTA tables, and `tax_form_thresholds`. A table that is unwritable *and empty* is a feature that can never start: nothing seeded it and the app cannot seed it either.
  **`catalogs.ifta_states` is the one with real consequence.** IFTA state registration underpins interstate fuel-tax reporting for a Laredo↔Mexico carrier; the system already holds 1,548 fuel transactions, 96 IFTA tax-rate rows, 3 non-IFTA jurisdictions, and an IFTA line in the Month-close wizard. The rate table is populated and readable, but the **states** table is empty and the app cannot add to it — so IFTA setup cannot be completed through the product. This compounds LV-071's finding that `ifta_license_number` is NULL on all three companies: the licence number is missing *and* the states table it would pair with is unwritable.
  **`driver_finance.settlement_disputes` is latent.** Settlements have never run (0 rows, LV-047), so nothing has needed a dispute yet. But when one is raised, the write will fail — a silent-failure path armed and waiting rather than an active fault.
  **Method — the same check produces both a PASS and a FAIL, and only the row count separates them.** Reporting "7 tables deny INSERT" as a defect would have been wrong for 4 of the 7; reporting none would have missed 3. The origin/intent test applies to privileges exactly as §0 applies it to data.
- severity:  major (two features cannot ever populate; one is statutory fuel-tax setup)
- LANE:      CC-1 (platform) — grant INSERT on `catalogs.ifta_states` and `driver_finance.settlement_disputes` alongside the `audit.scenario_status` grant from LV-075, and confirm each then persists a row. Leave the four populated tables denied — that denial is the control.
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. Across 20 schemas, tables where `has_table_privilege('ih35_app', …, 'INSERT')` is false = **7**, enumerated above with live row counts. `catalogs.ifta_states` count **0**; `driver_finance.settlement_disputes` count **0**; `events.event_log` count **1,361** with newest `created_at` **2026-08-05T11:00:00.006Z**; `reference.ifta_tax_rates` 96; `reference.non_ifta_jurisdictions` 3; `catalogs.tax_form_thresholds` 8; `audit.scenario_status` 0.
- status:    OPEN

## LV-077  GUARD — catalogs coverage and the JE-type gap re-measured: **only 11 of 1,787 journal entries carry a `journal_entry_type_id` (0.6%)** despite 16 active types existing; and `catalogs.classes` is 100% TRANSP-only, so USMCA/TRK have no class dimension at all
- module:    accounting / catalogs (GUARD live-verify-after-merge)
- entity:    ALL
- surface:   `catalogs.journal_entry_types` · `catalogs.classes` · `catalogs.items` · `catalogs.detail_types`
- observed:  **Catalogs are populated and healthy**: `journal_entry_types` **16, all active**; `detail_types` **144**; `items` **241**; `classes` **177**. Every table `ih35_app` needs to read is readable — across 20 schemas, tables denying **SELECT** to the runtime role = **0**.
  **JE typing has barely moved and the denominator has grown.** LV-021 measured 11 typed journal entries. It is still **11 — now against 1,787 entries, i.e. 0.6%**, and 16 active types are sitting unused. The gap is not "types were never configured"; the catalog is complete and the auto poster simply does not stamp the column. Since LV-021 the untyped population has grown, so JE-type reporting is getting blinder, not better. This is the same shape as LV-028 (`detail_type_id` populated on 48 of 1,442 accounts while `account_subtype` carries the real value on 1,435) — a catalog that exists, a column that references it, and a writer that never sets it.
  **`catalogs.classes` is entirely single-entity.** All **177** classes belong to TRANSP; **0** belong to USMCA or TRK. So the class dimension — the one field §7 allows to render green, and the QBO-parity grouping used across reports — does not exist for two of the three operating companies. `catalogs.items` by contrast is properly distributed: TRANSP 190, TRK 46, USMCA 5 (241 total).
  **Why the items/classes asymmetry matters.** Both are per-entity catalogs reached from the same categorization surfaces. Items were seeded per entity; classes were not. Any TRK or USMCA transaction that needs a class has nothing to select, and the inline "+ Add new" path (§7) would be the only way to create one — which lands back on LV-045, where the class dropdown is capped at 200 with no pagination. TRANSP is at 177 of that 200 cap while the other two entities sit at zero.
  Recording the JE-type figure precisely because LV-021 has been cited since as "auto poster never stamps journal_entry_type_id"; that remains true and the current ratio is **11 / 1,787**.
- severity:  major (JE-type reporting blind on 99.4% of the ledger; two entities have no class dimension)
- LANE:      CC-1 (accounting) for JE-type stamping — note LV-021 flagged that intent must be confirmed first, since entry-type may be manual-only by design; CURSOR/CC-1 for seeding classes on TRK and USMCA
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. `catalogs.journal_entry_types` 16 total / 16 active. `accounting.journal_entries` with `journal_entry_type_id IS NOT NULL` = **11** of **1,787** (0.6%). `catalogs.classes` 177 total, TRANSP 177, non-TRANSP **0**. `catalogs.items` 241 total — TRANSP 190, TRK 46, USMCA 5. `catalogs.detail_types` 144. Tables denying SELECT to `ih35_app` across 20 schemas = **0**.
- status:    OPEN

## LV-078  PM automation has run **3,914 times** and written **33,216 auto-WO log rows** while only **4 of 182 units** have a schedule and **0 of 24 schedules are active** — high-volume machinery driving one work order. Plus a real landmine: an empty `app.operating_company_id` makes maintenance RLS **throw**, not return zero.
- module:    maintenance / fleet (GUARD live-verify-after-merge)
- entity:    TRANSP
- surface:   `maintenance.pm_schedules` · `pm_schedule_runs` · `pm_auto_wo_log` · `work_orders` · `mdata.units`
- observed:  **The automation is busy; the configuration is empty.**
  | measure | value |
  |---|---|
  | `pm_schedule_runs` | **3,914** |
  | `pm_auto_wo_log` rows | **33,216** (7,854 historical deletes) |
  | `pm_schedules` total | 24 |
  | `pm_schedules` **active** | **0** |
  | distinct units with any schedule | **4** of **182** |
  | `work_orders` produced | **1** (with unit and vendor set) |
  | `work_order_lines` | 1 |
  So the preventive-maintenance engine has executed nearly four thousand times and written thirty-three thousand log rows, against a configuration where **no schedule is active** and **178 of 182 units are uncovered**. Whatever those 33,216 rows record, they are not producing work: exactly one work order exists in the entire system.
  **I am deliberately NOT calling the empty configuration a defect.** Per §0's origin rule and the owner's standing statement that nothing operational has been created in the TMS — no loads, no dispatch, no maintenance beyond test — an unconfigured PM programme is expected state. A prior finding recorded the fleet as having *zero* PM schedules; there are now 24, so the direction is forward.
  **What is worth flagging is the ratio, not the emptiness.** A scheduler that runs 3,914 times and logs 33,216 rows while 0 schedules are active is doing sustained work with no possible output. That is either a loop that should short-circuit when no active schedule exists, or a log that records evaluations rather than actions. Either way it is 33,216 rows of storage and 3,914 executions bought for one work order, and it will look identical whether the programme is switched on correctly later or stays broken — the same "expected-state-recorded-as-failure" ambiguity as LV-027 and LV-053. **UNVERIFIED — whether the log records evaluations or attempted actions**; I did not read the scheduler, and the answer decides whether this is benign idling or wasted work.
  **Separately — a genuine RLS landmine, found by tripping it.** After an earlier test set `app.operating_company_id` to the empty string, every query against `maintenance.*` failed with **`invalid input syntax for type uuid: ""`**. The policy casts the GUC to `uuid` without a `NULLIF` guard, so an **empty** GUC **throws** instead of returning zero rows. That matters because it is the opposite of the documented RLS-0 landmine: an unset GUC silently yields 0 (a false-empty), while an *empty-string* GUC produces a hard error. Any code path that clears rather than unsets the GUC will 500 on maintenance rather than degrade quietly. The canonical FORCED-RLS pattern in §2 uses `current_setting('app.operating_company_id', true)` with a `NULLIF`-style guard elsewhere; these maintenance policies appear not to.
  **The landmine is enumerable and small — I counted the whole class rather than reporting the one table I tripped over.** Exactly **5 policies** in the entire database cast `current_setting('app.operating_company_id')` to `uuid` without a `NULLIF` guard: `dispatch.customer_notify_preferences` (`customer_notify_preferences_company_scope`), `dispatch.notify_log` (`notify_log_company_scope`), `maintenance.pm_auto_engine_settings`, `maintenance.pm_auto_wo_log`, and `maintenance.pm_schedule_runs`. **Every other RLS policy uses the safe pattern.** So this is a bounded 5-table class, not a systemic flaw — and two of the five are dispatch **notification** tables, i.e. the customer-facing messaging path, where a hard 500 on an empty GUC is worse than a silent empty.
- severity:  major (33,216 log rows and 3,914 runs producing 1 WO; plus 5 RLS policies that throw on an empty GUC)
- LANE:      CC-1 / CURSOR (maintenance) — short-circuit the scheduler when no active schedule exists, and add the `NULLIF` guard to the maintenance RLS cast so an empty GUC degrades instead of erroring
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement, `app.operating_company_id` set to TRANSP. `maintenance.pm_schedule_runs` **3,914**; `pm_auto_wo_log` **33,216**; `pm_schedules` 24 total with **0** `is_active` and **4** distinct `unit_id`; `mdata.units` without any PM schedule **178** of 182; `maintenance.work_orders` **1** (unit and vendor both set); `work_order_lines` **1**. Landmine reproduced: with `app.operating_company_id = ''`, `SELECT count(*) FROM maintenance.pm_schedule_runs` raises `invalid input syntax for type uuid: ""`; setting the GUC to a valid uuid makes the identical query succeed.
- status:    OPEN

## LV-079  Module readiness map — insurance, compliance and legal are **configured but unpopulated**: 45 + 64 + 69 reference rows and essentially no records. Recorded as EXPECTED STATE, explicitly NOT filed as defects.
- module:    insurance · compliance · legal (GUARD live-verify-after-merge)
- entity:    ALL
- surface:   `insurance.*` · `compliance.*` · `legal.*`
- observed:  Three compliance-adjacent modules measured end to end. All three follow the same pattern: **reference/catalog data seeded, operational records absent.**
  | module | populated tables | everything else |
  |---|---|---|
  | insurance | `type_catalog` **45** | `policy`, `policy_unit`, `coi_request`, `payment_schedule` — all **0** |
  | compliance | `required_document_types` **54**, `appraisal_districts` **10** | 18 of 20 tables **0** |
  | legal | `contract_templates` **69**, `contract_audit_log` 30, `contract_instances` **1** | `signatures` **0** |
  **I am recording these as EXPECTED STATE and filing none of them as defects.** The owner has stated repeatedly that nothing operational has been created in this TMS — no loads, no dispatch, no maintenance, no safety events — and that all real data arrived as QuickBooks and Relay imports. Per §0's origin rule and Rule 32 (load-linkage pre-operational), "this module has no records yet" is not a defect and opening a card for it would be the `expected-state-recorded-as-failure` anti-pattern. The catalogs being *seeded* is the meaningful signal: someone prepared these modules to be usable.
  **The one exception I already filed stands, and it is a different shape.** LV-049/LV-071 report that the single `legal.contract_instances` row is marked `signed_electronically` while carrying **no signed PDF and no `signatures` row**. That is not "nothing has happened yet" — it is a record asserting that something *did* happen, with no evidence behind it, on the control that gates escrow forfeiture. Absence is expected; a false positive is not.
  **Why the distinction is worth stating explicitly.** Across this sweep the same raw shape — an empty table — has been correct three times (escrow, factoring, these three modules) and wrong twice (`audit.scenario_status` empty *because the role cannot INSERT*, LV-075; `catalogs.ifta_states` empty *and* unwritable, LV-076). Emptiness alone carries no verdict. The discriminator that separated them was **writability and intent**, not row count: a module with seeded catalogs and writable tables is waiting; a table that is empty *and* denies INSERT can never start.
- severity:  informational — no defect; recorded so the emptiness is not re-discovered and mis-filed later
- LANE:      none — GUARD attestation. Insurance/compliance population is owner/operational work, not a code fix.
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement, `app.operating_company_id` set to TRANSP. `insurance.*` tables with `n_live_tup > 0`: only `type_catalog` (45). `compliance` schema: 20 tables, only `required_document_types` (54) and `appraisal_districts` (10) non-empty. `legal`: `contract_templates` 69, `contract_audit_log` 30, `contract_instances` 1, `signatures` 0.
- status:    OPEN (informational)

## LV-080  GUARD — bank categorization is never half-done: all **170** categorized transactions carry both a CoA and a GL account (**0** exceptions of 11,007); and **1,413** transactions already carry a unit link, 8× the categorized count
- module:    banking (GUARD live-verify-after-merge)
- entity:    TRANSP
- surface:   `banking.bank_transactions` categorization columns
- observed:  **Integrity PASS — categorization is atomic in practice.** Of **11,007** unvoided bank transactions, **170** have `categorized_at` set, and exactly **170** carry `coa_account_id` *and* **170** carry `categorization_gl_account_id`. Transactions marked categorized but missing an account: **0**. So the categorization write never lands half-applied — a row is either uncategorized or fully coded to an account. That is the property that matters, because a `categorized_at` timestamp without an account would be the same status-without-substance shape as LV-010 (`sent` with no queue row) and LV-063's `overage_recovered_cents` without a deduction.
  **Attribution is far ahead of coding, and that is the more useful observation.** The same table already carries:
  | link | count | vs 170 categorized |
  |---|---|---|
  | `categorization_unit_id` | **1,413** | **8.3×** |
  | `categorization_driver_id` | **363** | 2.1× |
  | `categorization_load_id` | 13 | — |
  So unit and driver attribution have been resolved on far more transactions than have been accounting-coded. That attribution is arriving from telematics and fuel matching rather than from the categorization workflow, which means **the operational linkage needed to code these rows already exists on 1,413 of them** — the constraint on CLS-BANK-MATCH-DENSITY (LV-046, categorization frozen at 170 of 11,002) is not missing context. Whoever works that class has a large pre-attributed pool to draw on rather than a cold start.
  `categorization_load_id` at 13 is expected state, not a gap: no loads have been dispatched in the TMS (Rule 32 / LV-073), so there is almost nothing to link to.
  `banking.transaction_categories` holds 23 seeded categories and `banking.intercompany_entity_pairs` 6, so the supporting catalogs are configured.
- severity:  informational — integrity PASS plus a materially useful observation for the open categorization class
- LANE:      none — GUARD attestation. Note for CC-1 working CLS-BANK-MATCH-DENSITY: 1,413 transactions already carry unit attribution.
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement, `app.operating_company_id` set to TRANSP, exit 0. `banking.bank_transactions` unvoided **11,007**: `categorized_at` NOT NULL **170**, `coa_account_id` NOT NULL **170**, `categorization_gl_account_id` NOT NULL **170**, `categorization_unit_id` **1,413**, `categorization_driver_id` **363**, `categorization_load_id` **13**. Count categorized with neither CoA nor GL account = **0**. `banking.transaction_categories` 23, `intercompany_entity_pairs` 6, `bank_accounts` 17.
- status:    OPEN (informational)

## LV-081  ★ ORIGIN CENSUS — **99.98% of every financial record is a QuickBooks/Relay import. TMS-native total: 14 records out of 56,857.** Consult this before calling ANY gap a defect.
- module:    cross-module (GUARD — canonical origin reference)
- entity:    ALL
- surface:   `accounting.invoices` · `accounting.bills` · `accounting.expenses` · `fuel.fuel_transactions`
- observed:  The owner has had to restate the same fact repeatedly: *"all transactions are synced from QuickBooks, we have not begun creating invoices, dispatch, loads etc, we are only testing."* This finding exists so the fact is **measured** rather than remembered, and so any future reader can settle an origin question in one lookup instead of re-deriving it or asking again.
  | record type | total | import-origin | % imported | TMS-native |
  |---|---|---|---|---|
  | invoices (`source_system='qbo'`) | 11,983 | 11,976 | **99.94%** | **7** |
  | bills (`qbo_bill_id`) | 16,250 | 16,245 | **99.97%** | **5** |
  | expenses (`qbo_purchase_id`) | 27,072 | 27,070 | **99.99%** | **2** |
  | fuel transactions (`imported_at`) | 1,552 | 1,552 | **100.00%** | **0** |
  | **TOTAL** | **56,857** | **56,843** | **99.98%** | **14** |
  **Fourteen records.** That is the entire TMS-native financial footprint of this system, and every one of them is a test artifact created during verification — the $5.00 and $1.00 invoices, the $1,200 WIRE-04 test invoice, the $25 draft bill, the two proof expenses. Loads stand at 6 (4 live, all test, LV-073); dispatched loads at 0; settlements at 0; work orders at 1.
  **The operational consequence, stated once so it need not be inferred again:** for any query over these tables, the answer describes **QuickBooks history**, not this product's behaviour. An empty link, an unposted document, a null `load_id`, an uncategorized bank row — on 56,843 of 56,857 records these are the **correct** state under parallel double-books, because QBO is the system of record and the TMS has not transacted. A defect can only exist in (a) the **14 native records**, (b) the **code path** that will handle the fifteenth, or (c) a **control that misreports** either. Everything else is history being carried, and "fixing" it means inventing financial data.
  **This is not theoretical — I violated it during this very sweep.** LV-063 filed $316.34 of fuel-card overage as never recovered; the origin test showed all three rows were Relay imports with no settlement to deduct from, and I retracted it. The census exists so the next agent runs the lookup instead of the retraction.
  **Live import still active:** fuel transactions moved 1,548 → **1,552** during this session, so the import cohort is growing in real time and any "missing" count taken against it is stale within hours.
- severity:  informational — canonical reference; prevents the most repeated class of false finding in this file
- LANE:      none — GUARD attestation for all lanes
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement, `app.operating_company_id` set to TRANSP, exit 0. Single UNION query over four tables returning total, import-origin count and percentage per type as tabulated; totals 56,857 records with 56,843 import-origin = 99.98%, leaving 14 TMS-native.
- status:    OPEN (informational — permanent reference)

## LV-082  GO-FORWARD VERDICT on the 14 native records: **11 posted, 3 correctly declined, 1 wrongly accepted.** The poster is fully observable at this size — and it already demonstrates the LV-064 denylist defect exactly once.
- module:    accounting (GUARD — go-forward engine verdict)
- entity:    TRANSP + USMCA
- surface:   the 14 TMS-native records from LV-081 vs `accounting.posting_batches`
- observed:  LV-081 established that only **14** financial records in the system were created by this TMS. That is small enough to audit **exhaustively** rather than statistically — every native record's posting outcome can be checked individually, which is not possible for the 56,843 imported ones. Doing so:
  | type | native | posted | not posted |
  |---|---|---|---|
  | invoices | 7 | **4** | 3 |
  | bills | 5 | **5** | 0 |
  | expenses | 2 | **2** | 0 |
  | **total** | **14** | **11** | **3** |
  **All 3 non-postings are correct** (LV-059): INV-2026-00002 is `proforma` (a non-posting projection by design), INV-2026-00741 is `draft` (not issued), INV-2026-00004 has `total_cents = 0` (nothing to post). So the engine declined exactly the documents it should decline.
  **One of the 11 postings is wrong, and it is the LV-060 draft bill.** Bill `f8f8e5a4` ($25.00) was created `draft`, never left draft, and posted to the general ledger three minutes later. So across the complete native population the poster is **13 of 14 correct**: it refuses draft *invoices* and accepts draft *bills*, which is precisely the allowlist-versus-denylist asymmetry LV-064 enumerates across 4 of the 5 posters.
  **Why this is the strongest available evidence for LV-064.** The defect is not inferred from reading code alone — it is observable in the live outcome of the entire go-forward corpus. With 14 records, one incorrect posting is a **7% error rate on native documents**, and it is the *only* error. At $25 on test data it is a curiosity; the same code path at real dispatch volume produces a stream of prematurely recognised liabilities from un-issued documents, and by then the population is too large to audit exhaustively the way I just did.
  **This is the cheapest moment in the system's life to fix it.** The native corpus is 14 records, there is no posted history to unwind, and the correct pattern (`INVOICE_ELIGIBLE_STATUSES`) already exists in the same file. Every additional day of real volume raises the cost.
  **Method note:** this verdict is only meaningful *because* of the origin census. Run against all 56,857 records the same query returns "11 of 56,857 posted", which reads as catastrophic and is meaningless. Scoping to the 14 native records turns an uninterpretable ratio into an exhaustive audit with a single defect.
- severity:  major (confirms LV-064 empirically on the complete native corpus; 1 incorrect posting of 14)
- LANE:      CC-1 (money) — LV-064 remains the fix: replace the 4 denylists with allowlists mirroring `INVOICE_ELIGIBLE_STATUSES`
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement, `app.operating_company_id` TRANSP, exit 0. TMS-native records with a `posted` batch: invoices **4** of 7 (`source_system='tms'`), bills **5** of 5 (`qbo_bill_id IS NULL`), expenses **2** of 2 (`qbo_purchase_id IS NULL`) — 11 of 14. The 3 unposted invoices and their statuses per LV-059; the incorrectly posted draft bill `f8f8e5a4-8c66-4d16-a4c9-44beff6b79e2` per LV-060.
- status:    OPEN

## LV-083  §10 LINKAGE LAW violation — **3 canonical tables carry foreign keys INTO retired schemas**, and the retire targets are not dormant: `maint.part` holds 144 rows and `maint.pm_schedule` 24, duplicating the canonical `maintenance.*` tables exactly
- module:    maintenance · driver_finance (GUARD — §10 linkage law)
- entity:    ALL
- surface:   RETIRE schemas `payroll` · `settlement` · `bank` · `maint` vs canonical `driver_finance` · `banking` · `maintenance`
- observed:  §10 defines the RETIRE→canonical mapping — `driver_finance.*` supersedes `payroll.*`/`settlement.*`, `banking.*` supersedes `bank.*`, `maintenance.*` supersedes `maint.*` — and states that FK-ing a RETIRE table is a correctness gate, not a style preference.
  **11 retire tables still exist** (maint 5, settlement 3, payroll 2, bank 1) and **9 FKs point into them**. Splitting those 9 by origin is what separates legacy debris from a live violation:
  **The 3 live violations — canonical → RETIRE:**
  | from (canonical) | → to (RETIRE) | target rows |
  |---|---|---|
  | `driver_finance.trip_link_queue` | `settlement.settlement_line` | 0 |
  | `maintenance.position_history` | `maint.position_set` | **6** |
  | `maintenance.position_history` | `maint.part` | **144** |
  The remaining **6 are retire→retire** (`maint.part_position_assignment`→`maint.position_set`, `maint.position_history`→`maint.position_set`/`maint.part`, `payroll.driver_settlement_line_items`→`payroll.driver_settlements`, `settlement.settlement_deduction`/`settlement_line`→`settlement.settlement`) — internal legacy structure, harmless, and correctly left alone under archive-never-delete.
  **The retire targets are populated, which is the part that makes this more than bookkeeping.** `maint.part` **144** and `maint.pm_schedule` **24** — and the canonical side reports `maintenance.parts_inventory` **144** and `maintenance.pm_schedules` **24**. Identical counts on both sides means these are not dormant shells awaiting drop; **the same data exists in both the retired and the canonical schema**. So `maintenance.position_history` — a canonical table — resolves its part and position references through the **retired** copy while an equivalent canonical copy exists alongside it. Any divergence between the two copies would silently split maintenance history.
  **What I am NOT claiming.** I did not verify that the 144 `maint.part` rows are the *same* 144 as `maintenance.parts_inventory` — only that the counts match exactly, which is strong but not proof of identity. **UNVERIFIED — row-level identity between the retire and canonical copies**; establishing it needs a key-level diff, and the answer determines whether this is a safe repoint or a genuine data merge.
  Under §10 and archive-never-delete, the fix is to **repoint the 3 canonical FKs at canonical targets** and leave the retire tables in place archived — never to drop them.
- severity:  major (§10 correctness gate — canonical tables structurally depend on retired schemas holding live duplicate data)
- LANE:      CC-1 / CURSOR (maintenance + driver_finance) — repoint `maintenance.position_history` to `maintenance.parts_inventory` and the canonical position table, and `driver_finance.trip_link_queue` to the canonical settlement line; archive the retire tables, do not drop them
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement, `app.operating_company_id` TRANSP, exit 0. Base tables in retire schemas = **11** (maint 5, settlement 3, payroll 2, bank 1). FKs whose target is a retire schema = **9**, of which **3** originate outside retire schemas and **6** are retire→retire, each enumerated above. Retire row counts: `maint.part` **144**, `maint.pm_schedule` **24**, `maint.position_set` **6**, all others **0**. Canonical comparison: `maintenance.parts_inventory` **144**, `maintenance.pm_schedules` **24**.
- status:    OPEN

## LV-084  §10 — the retired `accounting.qbo_*` tables hold **7,934 rows that DRIFT from canonical master data** (49 vendors, 41 customers apart). Nothing structurally depends on them (1 FK, self-referential), so this is a read-risk not a coupling risk.
- module:    accounting · mdata (GUARD — §10 linkage law, QBO mirror)
- entity:    ALL
- surface:   `accounting.qbo_*` (RETIRE) vs `mdata.qbo_*` (canonical mirror) vs `mdata.vendors`/`customers`
- observed:  §10 states the QBO mirror is `mdata.qbo_*` **read-only**, that projections write `accounting.*`, and that **`accounting.qbo_*` is RETIRE**. Both mirrors are live on prod.
  **The retired set holds 7,934 rows:** `accounting.qbo_vendors` **2,782**, `qbo_customers` **2,655**, `qbo_accounts` **1,647**, `qbo_remote_counts` 848, `qbo_remote_count_collection_state` 2.
  **The canonical mirror is an order of magnitude larger** and is clearly the one being fed: `mdata.qbo_sync_runs` **31,728**, `qbo_purchases` **28,332**, `qbo_ar_payments` **23,308**, `qbo_ap_bills` **17,303**, `qbo_ar_invoices` **9,078**, `qbo_ap_bill_payments` **6,397** — 14 tables in total.
  **The retired copies have drifted from canonical master data:**
  | retired | rows | canonical | rows | drift |
  |---|---|---|---|---|
  | `accounting.qbo_vendors` | 2,782 | `mdata.vendors` | 2,831 | **49** |
  | `accounting.qbo_customers` | 2,655 | `mdata.customers` | 2,696 | **41** |
  So the retired tables are neither empty nor synchronised — they are a stale snapshot roughly 1.7% behind canonical vendors and 1.5% behind canonical customers. That is the worst of both states for a retired table: populated enough to look authoritative, stale enough to be wrong.
  **The structural risk is low and I checked rather than assuming it.** Exactly **1** foreign key targets the `accounting.qbo_*` set, and it is `accounting.qbo_accounts` → `accounting.qbo_accounts` — a self-referential parent/child hierarchy. **No canonical table FKs into the retired QBO set**, so unlike LV-083 (where `maintenance.position_history` genuinely depends on `maint.*`) nothing here is structurally coupled. The exposure is purely that application code or a report could still *read* these tables and get 49 vendors' worth of stale answers.
  This is the live measurement behind the standing unresolved contradiction over which `qbo_vendors` is canonical: the owner ruled `mdata` canonical, and the drift figures quantify what deferring the repoint currently costs — a second, wrong copy that answers queries.
  **Not filed as a data defect.** Under archive-never-delete the retired tables should remain; the correct resolution is repointing readers, not dropping rows. And per the origin census (LV-081) every row in both mirrors is QuickBooks-imported, so neither copy is TMS-authored.
- severity:  major (a retired, drifted duplicate of master data remains readable; 49 vendors / 41 customers divergent)
- LANE:      CC-1 (money) — repoint any remaining readers of `accounting.qbo_*` at `mdata.*`; archive the retire tables in place, never drop
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement, `app.operating_company_id` TRANSP, exit 0. `accounting.qbo_*` = 5 tables totalling 7,934 rows as listed. `mdata.qbo_*` = 14 tables, top counts as listed. `mdata.vendors` **2,831** vs `accounting.qbo_vendors` **2,782**; `mdata.customers` **2,696** vs `accounting.qbo_customers` **2,655**. FKs targeting `accounting.qbo_*` = **1**, self-referential on `qbo_accounts`.
- status:    OPEN

---

# PASS 2026-08-05 — CC-2 / GUARD live verification (deploy `94c520a` == `origin/main` tip)

**ID continuity note:** this file's prior max is **LV-084**. `LV-085`/`LV-086`/`LV-087` are referenced by
merged PR **#4463** ("CLAIM-RESERVE: claim verify-step 2625 for CC-1 (LV-087 checksum-collision guard)")
but a repo-wide search returns **zero** definitions for any of the three. A verify-step number was reserved
on `main` against a finding ID that has never been published. I start at **LV-088** so I cannot collide with
whatever CC-1 holds those IDs to mean. Flagged, not claimed — CC-1 owns reconciling it.

## LV-088  SCENARIO TRACKER ENTITY LEAK — the TRANSP board displays **ALL-entity** certifications, including USMCA rows, on every one of the **23** scenario keys
- module:    home · scenario-tracker (GUARD — false-green / entity isolation)
- entity:    TRANSP + USMCA + TRK (all three; the leak is in the read path, not the data)
- surface:   Office HOME → "End-to-End Scenario Tracker" · `apps/backend/src/home/scenario-tracker.service.ts` `currentCert()` · `audit.scenario_status`
- expected:  A board whose header reads `scope: 91e0bf0a-…` (TRANSP) shows TRANSP's certification.
- observed:  It shows the **ALL-scope** certification instead. Live on prod, TRANSP selected, three hops on one screen:
  | hop | live (TRANSP, correct) | cert shown (ALL, wrong) | TRANSP cert on prod | USMCA cert on prod |
  |---|---|---|---|---|
  | `hop.book` | 2 loads | **3 loads** | 2 | 1 |
  | `hop.invoice` | 2 invoices sent/paid | **5 invoices** | 2 | 3 |
  | `hop.gl` | 1747 journal entries | **1765 entries** | 1747 | 12 |
  The displayed number is exactly TRANSP + USMCA + TRK every time. **USMCA freight is being counted onto
  the TRANSP board** — and USMCA is the entity that is supposed to stay hidden until launch (`ih35-entity-facts`).
  **ROOT CAUSE — located, not inferred.** `currentCert()` (scenario-tracker.service.ts:~85):
  ```sql
  WHERE is_current AND scenario_key = $1
    AND (operating_company_id IS NULL OR $2::uuid IS NULL OR operating_company_id = $2::uuid)
  ORDER BY verified_at DESC LIMIT 1
  ```
  The first disjunct `operating_company_id IS NULL` makes the **ALL-scope row match for every entity**. Two rows
  then qualify (ALL + TRANSP) and the tie is broken by `ORDER BY verified_at DESC LIMIT 1` — with **no
  deterministic tiebreaker**. The certifier writes all four scopes in one sweep, so `verified_at` is *identical*:
  every one of the **23** scenario keys has exactly **4** current rows with **`count(DISTINCT verified_at) = 1`**
  (`2026-08-05T19:05:00.002Z`). The tie is resolved arbitrarily by Postgres, and on prod it is landing on ALL.
  **Why this is worse than a cosmetic count.** This board is the Phase-1 evidence surface — the thing read to
  decide whether a hop is done. Three hops currently read **PASSED** on TRANSP while the number underwriting
  that badge belongs partly to a different legal entity. Per §0 the highest-cost error class is attributing
  something to the wrong entity; here it is happening in the *evidence layer itself*, which is the layer whose
  entire job is to be trustworthy. An operator cannot see it: both numbers are plausible and sit side by side.
  **Scope is systemic, not one row:** 23 of 23 scenario keys, all 4 scopes, every hop on the board.
  **What I am NOT claiming.** The **live** (left-hand) numbers are correct and correctly entity-scoped — I
  verified 1747 = TRANSP's 1769 JEs minus its 22 reversals, exactly. The defect is confined to the *cert*
  half of the row. The underlying `audit.scenario_status` data is also correct — all four scopes are stored
  properly and separately. **Nothing needs recomputing; only the read path needs to stop matching ALL.**
- severity:  **critical** (cross-entity contamination of the evidence surface; USMCA surfaced on TRANSP; 23/23 keys)
- LANE:      CC-1 (money/GL board) or CURSOR (home FE read path) — fix `currentCert()` to prefer the entity-specific
             row: match ALL **only** when `$2 IS NULL`, or add a deterministic tiebreaker
             (`ORDER BY (operating_company_id IS NOT NULL) DESC, verified_at DESC`). Guard must plant a
             two-scope fixture with identical `verified_at` and assert the entity row wins — a guard that
             only checks "a cert exists" reproduces this bug.
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass in its own statement, exit 0.
             `audit.scenario_status WHERE is_current`: **23** keys × **4** rows, `distinct_ts = 1` on every key,
             exactly 1 ALL-scope row per key. `hop.book` ALL=3 / TRANSP=2 / USMCA=1 / TRK=0;
             `hop.invoice` ALL=5 / TRANSP=2 / USMCA=3 / TRK=0; `hop.gl` ALL=1765 / TRANSP=1747 / USMCA=12 / TRK=6.
             Corroborated in-app at `https://app.ih35dispatch.com/home` as owner, TRANSP selected.
- status:    OPEN

## LV-089  GL INTEGRITY — **PASS**: all 1,787 journal entries balance DR=CR exactly, zero orphans, zero single-line entries
- module:    accounting (GUARD — money integrity, fail-closed check)
- entity:    ALL (TRANSP 1769 · USMCA 12 · TRK 6)
- surface:   `accounting.journal_entries` × `accounting.journal_entry_postings`
- observed:  This is the check I am required to fail closed on, and it **passes cleanly**:
  - **1,787 of 1,787** JEs balanced (`sum(debit) = sum(credit)` per entry). **Unbalanced: 0.**
  - Total debits **1,163,883,772** cents == total credits **1,163,883,772** cents ($11,638,837.72).
  - **0** single-line JEs (every entry has ≥2 postings).
  - **0** journal entries with no posting lines at all (LEFT JOIN orphan check returned empty).
  - **0** posting lines with a NULL `account_id`.
  - Every JE on prod is `status='posted'` with `voided_at IS NULL` in all three entities.
  Reversal linkage is also structurally sound: all **22** reversal JEs carry `reverses_je_id`, and **22** carry
  `reversed_by_je_id` — the §10 both-way link resolves through **columns, not memo text**. I checked memo-parsing
  specifically because the memos do contain "Reversal of journal entry <uuid>"; the FK is populated in 22 of 22,
  so the text is redundant rather than load-bearing.
- severity:  none — recorded as a PASS so the next agent does not re-derive it
- LANE:      n/a
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass in its own statement, exit 0.
             Counts as stated; `debit_or_credit` domain verified to be exactly {`debit`,`credit`} so the
             balance aggregate cannot silently miss a third spelling.
- status:    PASS

## LV-090  READ-PATH CENSUS for the retired `accounting.qbo_*` set — the **7,084 drifted master-data rows have ZERO live readers** and are safe for CC-1 to archive; the 860 recon rows are LIVE and must NOT be
- module:    accounting · integrations (GUARD — §10, unblocks LV-084)
- entity:    ALL
- surface:   `accounting.qbo_*` (RETIRE) vs live code in `apps/backend/src`
- observed:  LV-084 established the retired set has drifted from canonical. The open question blocking CC-1 was
  whether anything still **reads** it. Split by table, live code only (tests/specs excluded):
  | retired table | prod rows | live code refs | verdict |
  |---|---|---|---|
  | `accounting.qbo_vendors` | 2,782 | **0** | **safe to archive** |
  | `accounting.qbo_customers` | 2,655 | **0** | **safe to archive** |
  | `accounting.qbo_accounts` | 1,647 | **0** | **safe to archive** |
  | `accounting.qbo_remote_counts` | 858 | **10** | **LIVE — do not archive** |
  | `accounting.qbo_remote_count_collection_state` | 2 | **6** | **LIVE — do not archive** |
  **The three drifted master-data tables — the entire 7,084-row drift documented in LV-084 — have no live
  reader.** The 49-vendor / 41-customer divergence is therefore inert: it can answer no query, because nothing
  asks. Archiving them cannot break a read path.
  **The two recon tables are a different matter and must be carved out.** They are not stale duplicates at all —
  `remote-count-collector.ts` **INSERTs** into both (lines 106/137/230), and `reconciliation-worker.service.ts`
  + `qbo-recon-reads.ts` + `qbo-reconcile-read.service.ts` read them. Treating "`accounting.qbo_*` is RETIRE"
  as a blanket rule would archive a table the reconciliation worker actively writes. **The §10 mapping is
  correct per-table, not per-prefix.**
- severity:  informational — this is the evidence CC-1 asked for; the actionable part is the carve-out
- LANE:      CC-1 (money) — archive `qbo_vendors`/`qbo_customers`/`qbo_accounts` in place (never drop, per
             `07-never-delete-only-add`); **exclude** `qbo_remote_counts` + `qbo_remote_count_collection_state`
             from any retire sweep and from any guard that forbids writes to `accounting.qbo_*`
- neon-check: prod `br-fancy-credit-akjnd07a`, bypass in its own statement, exit 0. Row counts as stated from
             `pg_class`/`pg_stat_user_tables`. Code census by grep over `apps/**/*.ts(x)` excluding
             `.test.`/`__tests__`/`.spec.`; per-table counts reproduced individually, not inferred from a total.
- status:    OPEN (evidence delivered to CC-1)

## LV-091  PHANTOM SCHEMA — live payroll code selects `FROM accounting.qbo_payroll_links`, a table that **does not exist on prod**; the route is also never mounted, so a shipped feature is inert
- module:    payroll-integration (GUARD — phantom schema + wiring)
- entity:    ALL
- surface:   `apps/backend/src/payroll-integration/qbo-payroll-pull.ts:52` · `aggregate.routes.ts`
- observed:  `pullQboPayroll()` runs `SELECT … FROM accounting.qbo_payroll_links qpl WHERE qpl.operating_company_id = $1 …`.
  On prod **`to_regclass('accounting.qbo_payroll_links')` returns NULL** — the table exists in no form
  (checked all `relkind`, so it is not a view or matview either). The `accounting` schema contains exactly five
  `qbo_*` relations and this is not among them. Any execution throws `42P01 undefined_table`.
  **It is not currently throwing in production, and the reason is its own defect.** `pullQboPayroll` is called
  by `aggregate.routes.ts:51`, which lives inside `registerPayrollIntegrationRoutes` — exported as a
  `fastify-plugin` default export and referenced **nowhere outside its own file**. There is no global autoload
  that would pick it up: the only `@fastify/autoload` in the codebase is in `accounting/index.ts`, scoped to the
  accounting directory. So `GET/POST /api/v1/payroll-integration/aggregate*` is **not mounted** on the running
  server. A payroll-aggregate feature appears built (routes, RBAC, zod validation, tests) and is unreachable.
  **Both halves matter and they mask each other.** The unmounted route hides the phantom table (no 500s in
  logs); the phantom table means the day anyone wires the route up, it fails immediately on first call. Fixing
  only the mount would ship a guaranteed `42P01` to production.
  **UNVERIFIED — whether `accounting.qbo_payroll_links` was ever intended to exist** (no migration creates it)
  or whether the canonical target should be `mdata.qbo_*` per §10. That is a design call, not a live fact, and
  it decides whether the fix is a migration or a repoint. CC-1 owns it.
- severity:  major (latent guaranteed runtime failure + a module that reads as built but is not wired)
- LANE:      CC-1 (money — payroll/settlements) — decide canonical target, then either add the table via
             idempotent migration or repoint at `mdata.qbo_*`; mount the plugin only after the read resolves.
             Guard must assert every `FROM accounting.<table>` in live code resolves via `to_regclass` — this
             class is invisible to typecheck and to CI without a live schema check.
- neon-check: prod `br-fancy-credit-akjnd07a`, bypass in its own statement, exit 0.
             `to_regclass('accounting.qbo_payroll_links')` → **NULL**; control on the same query
             `to_regclass('accounting.qbo_vendors')` → `accounting.qbo_vendors` (non-null), so the NULL is a
             real absence and not a search_path or permission artifact.
- status:    OPEN

## LV-092  POSTING-LINE TRACEABILITY — 82 posted GL lines carry no `source_transaction_type`/`id`; **44 are reversals and 4 are revrec (real gap), 32 are manual JEs (EXPECTED STATE, not a defect)**
- module:    accounting (GUARD — §10 both-way linkage on posting lines)
- entity:    TRANSP (all 82)
- surface:   `accounting.journal_entry_postings.source_transaction_type` / `source_transaction_id` / `reversal_of_line_id`
- observed:  Of **3,603** posting lines, **82** have NULL `source_transaction_type` **and** NULL
  `source_transaction_id`. I classified all 82 by origin before calling any of it a defect (§0 origin test):
  | cohort | JEs | lines | verdict |
  |---|---|---|---|
  | reversal JEs (`source='auto'`) | 22 | **44** | real gap — line-level |
  | manual JEs (`source='manual'`) | 2 | **32** | **EXPECTED — not a defect** |
  | revrec JEs (`source='auto'`) | 2 | **4** | real gap |
  | fuel-card overage receivable (`auto`) | 1 | **2** | real gap |
  **The 32 manual lines are correct as they stand.** A manual journal entry *is* the source document — there is
  no upstream transaction to point at. Reporting those as orphans would be the `expected-state-recorded-as-failure`
  anti-pattern, and a guard that reddens on them would have to be suppressed on day one.
  **The real gap is 50 lines, and it is narrower than "no traceability".** For the 44 reversal lines the
  *entry-level* link is intact (LV-089: 22/22 carry `reverses_je_id`), so a reversal can always be traced to the
  JE it reverses. What is missing is the **line-level** link: `reversal_of_line_id` is populated on **0 of 44**,
  and system-wide **0 of 3,603** — the column exists and has never been written. So you can say *which entry*
  a reversal undoes, but not *which line* — and with multi-line entries that mapping is inferred, not recorded.
  **The 4 revrec lines are the ones that matter going forward.** These are the Phase-1 money hop
  (`Revrec Event 1 earn` / `Event 2 bill` on load `L-20260624-0083`). Both were subsequently reversed with an
  owner-authorized memo recording that revrec had posted off load status with **zero delivery evidence and no POD**.
  So the revrec poster today writes GL lines that name no source transaction, on the exact hop Phase 1 is about
  to run for real. At 4 lines this is trivially fixable; at dispatch volume it is a reconciliation problem.
  **Not blocking, and I am not inflating it:** `posting_batch_id` is populated on 3,510 of 3,603 lines
  (1,755 batches), so batch-level provenance exists for the overwhelming majority.
- severity:  major (revrec cohort — the going-forward path) / minor (reversal cohort — entry-level link intact)
- LANE:      CC-1 (money) — stamp `source_transaction_type`/`id` in the revrec poster and
             `reversal_of_line_id` in the reversal poster; reuse the existing poster, write no new GL math.
             **Guard must scope to TMS-native non-manual entries** (`source <> 'manual'`) or it reddens on
             expected state and gets disabled.
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass in its own statement, exit 0.
             82 NULL-source lines of 3,603; cohort split by `je.source` × memo shape as tabulated;
             `reversal_of_line_id` non-null = **0** of 44 reversal lines and 0 of 3,603 overall;
             `posting_batch_id` non-null = 3,510 across 1,755 batches.
- status:    OPEN

### LV-088 ADDENDUM — second-entity corroboration: the leak also manufactures a **FALSE REGRESSION** on USMCA
Verified live after the original write-up, by switching company context to **USMCA Freight** (`5c854333-…`)
in the same authenticated session. The board header correctly reads `scope: 5c854333-…`, and the cert half
is again the ALL row (`19:35:00.055212+00` sweep — a later sweep than the first observation, same defect):

| hop | live (USMCA, correct) | cert shown (ALL, wrong) | badge |
|---|---|---|---|
| `hop.book` | 1 load booked | **3 loads** | PASSED |
| `hop.assign` | 1 driver bill | **3 driver bills** | PASSED |
| `hop.dispatch` | **0** dispatched | **1 dispatched** | **FIX (red)** |

**The dispatch row is the important one, and it inverts the severity of this finding.** The UI printed
`DOWNGRADED: certification says passed but the live predicate no longer holds` and painted the slice **FIX** —
the colour reserved for a *regression*. On prod, USMCA's **own** cert row for `hop.dispatch` is
`stage='built'`, `state='go'`, evidence `0 load(s) dispatched or beyond` — i.e. **correctly "not yet"**.
USMCA has never dispatched a load, so there is nothing to regress. The FIX badge exists **only** because the
read path took TRANSP's dispatched load (via the ALL row, `stage='passed'`) and measured it against USMCA's
live `0`.

So the same one-line predicate produces **two opposite failures** depending on which entity is selected:
- on **TRANSP** it **overstates** evidence (3/5/1765 instead of 2/2/1747) — a false green;
- on **USMCA** it **fabricates a regression** on a hop that was never passed — a false red.

A false red is the more corrosive of the two: it trains operators to disregard the board, and it would send a
builder to "fix" a hop whose only defect is that another entity's row was read. Under `06-quality-hardline`
(false-empty / false-green) and §0, both directions are the same root cause and the same one-line fix.

**Credit where due — the downgrade logic itself is correct and is what exposed this.** The read path
genuinely re-checks the live predicate against the certification instead of trusting the cert, which is why
the contradiction surfaced at all rather than sitting silently green. The defect is strictly the scope
predicate feeding it, not the downgrade mechanism.

- neon-check: prod `br-fancy-credit-akjnd07a`, bypass in its own statement, exit 0.
  `audit.scenario_status WHERE is_current AND scenario_key='hop.dispatch'` — ALL: `passed`/`done`/"1 load(s)
  dispatched or beyond"; USMCA `5c854333`: **`built`/`go`/"0 load(s) dispatched or beyond"**;
  TRANSP `91e0bf0a`: `passed`/`done`/"1 load(s)"; TRK `b49a737b`: `built`/`go`/"0 load(s)". All four rows
  share `verified_at = 2026-08-05T19:35:00.055Z` — `distinct_ts = 1`, so the tie persists across sweeps.
- status:    OPEN (same fix as LV-088; the guard must assert BOTH directions — no false green on the
             larger entity AND no false FIX on the smaller one)

## LV-093  CERTIFICATION DATA + §10.3 BOTH-WAY LINKAGE — **PASS**: zero false-greens across all 92 cert rows, and every invoice/bill posting resolves to a live source
- module:    accounting · home (GUARD — false-green hunt + linkage law)
- entity:    ALL (4 scopes: ALL + TRANSP + USMCA + TRK)
- surface:   `audit.scenario_status` · `accounting.journal_entry_postings` ↔ `accounting.invoices`/`bills`
- observed:  Two fail-closed checks, both clean, both positive-controlled.
  **(1) No false-green in the certification data.** Zero rows are certified `passed`/`complete` while their
  own evidence reads "0 …". **This empty is a verdict, not an unqualified zero** — completeness discriminator
  on the SAME table: `is_current` rows total **92** = **23** keys × **4** scopes (exactly the expected
  cross-product, nothing hidden), split `built/go` **58** + `passed/done` **34**. Positive control on the same
  predicate: the `^0 ` regex matches **58** rows — precisely the 58 `built` rows — proving the pattern *does*
  fire; of those 58, **0** are `passed`. So every zero-evidence slice is correctly parked at `built`.
  **This matters for how LV-088 gets fixed.** The stored certifications are correct and correctly
  entity-separated. LV-088 is **purely a read-path defect** — no backfill, no recompute, no data repair.
  A fix that touches `audit.scenario_status` rows would be repairing data that is already right.
  **(2) §10.3 both-way linkage resolves — forward.** Every posting line naming a source resolves to one:
  `source_transaction_type='invoice'` → **10** lines, **0** dangling; `='bill'` → **10** lines, **0** dangling.
  **(3) Reverse direction — 4 of 5 posted, and the 5th is CORRECTLY declined.** Of the TMS-native invoices
  that are `sent`/`paid` and not voided, **5** exist and **1** has no journal entry: `INV-2026-00004`
  (`f280b52a`, USMCA) with **`total_cents = 0`**. That is the exact case LV-059 already established as correct
  engine behaviour — there is nothing to post on a zero-value document. **Classified as EXPECTED STATE and
  deliberately NOT re-filed as a defect.** Reverse linkage is therefore 4 of 4 postable invoices posted.
- severity:  none — recorded as a PASS so the next agent does not re-derive it
- LANE:      n/a
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass in its own statement, exit 0.
             Counts and the positive control as stated above.
- status:    PASS

## LV-094  `source_transaction_id` is **text**, not `uuid` — the polymorphic source link is the one linkage in the posting table no foreign key can enforce
- module:    accounting (GUARD — §10 linkage durability)
- entity:    ALL
- surface:   `accounting.journal_entry_postings.source_transaction_id`
- observed:  Column types on the same table: `journal_entry_uuid` **uuid**, `reversal_of_line_id` **uuid**,
  but `source_transaction_id` **text** (paired with `source_transaction_type` **text**). The pairing is a
  deliberate polymorphic pointer — one column addressing invoices, bills, expenses, fuel events, bank
  categorizations and more — and Postgres cannot FK a polymorphic column, so this is a **consequence of the
  design, not a mistake in it**. I am recording it as a durability observation, not accusing it of being wrong.
  **It is currently intact and I verified that rather than assuming it:** 0 dangling of 10 invoice lines and
  0 of 10 bill lines (LV-093). Nothing is broken today.
  **The exposure is that nothing prevents it from breaking.** A void, a re-key, or a bad backfill can orphan
  a posting line's source pointer and the database will not object — unlike `journal_entry_uuid`, which is a
  real FK. At today's 3,603 lines a full re-resolution is cheap; the checks in LV-093 are exactly that sweep,
  and they are the only thing standing in for referential integrity here.
  **Not a request to change the column.** Converting a polymorphic pointer to a typed FK would mean one
  nullable FK column per source kind — a larger design change than the risk warrants, and squarely CC-1's call.
  The proportionate answer is a periodic guard that re-resolves every `(source_transaction_type,
  source_transaction_id)` pair against its target table and fails closed on the first orphan.
- severity:  minor (latent integrity risk; zero orphans at time of verification)
- LANE:      CC-1 (money) — if accepted, a recurring resolution guard scoped to TMS-native lines; **not** an FK
             migration, and **not** a guard over imported cohorts (§0 origin test)
- neon-check: prod `br-fancy-credit-akjnd07a`, bypass in its own statement, exit 0. Column types read from
             `information_schema.columns`; orphan counts per LV-093.
- status:    OPEN (informational — CC-1 decides whether to accept the guard)

## LV-095  GUARD VERIFY-AFTER of **ACCT-F114** (DRV-LIAB-CENTS-INTO-DOLLARS, PR #4473, landed @ `66c840c96`) — **PASS, and the sweep is COMPLETE**
- module:    driver_finance · safety (GUARD — post-merge live verification)
- entity:    ALL
- surface:   `driver_finance.driver_liabilities` · the 4 production writers of that table
- observed:  I verified the four claims this PR rests on rather than accepting them, and all four hold.
  **(1) The unit is DOLLARS — confirmed from the schema, not from the narrative.** On prod,
  `original_amount`, `current_balance` and `paid_to_date` are all **`numeric(10,2)`**. Consistent with the
  dollars reading and with the `numeric(10,2)` overflow ceiling (99,999,999.99) the PR describes.
  **(2) "Not corrupted in production" — VERIFIED with the strongest available discriminator.** A bare `0`
  would not have settled this (§0). On the SAME table, in one statement with `current_user` asserted:
  visible **0**, `n_live_tup` **0**, `n_tup_del` **0**, and decisively **`n_tup_ins` = 0** — the table has
  **never had a row inserted**, so no row was ever written at 100x and there is genuinely nothing to restate.
  `n_tup_ins = 0` is what makes this a verdict rather than an RLS artifact.
  **(3) All three sites are REALLY fixed — read from the diff, not from a grep.** My initial grep for the fix
  pattern found nothing in `safety-v5.routes.ts` and I did not conclude from that; the diff shows the fix
  **removed** the offending expression rather than introducing a new name, which a pattern-grep scores as
  absent. Confirmed per site: `safety.routes.ts:918` now passes `amountCents / 100`; `fines.routes.ts:380`
  passes a new `amountDollars = amount / 100`; `safety-v5.routes.ts:262` passes `Number(body.data.amount)`
  in place of `Math.round(... * 100)`.
  **(4) The money actually withheld from the driver's check is UNTOUCHED — the part a cosmetic fix breaks.**
  At both sites the cents path survives independently: `fines.routes.ts` keeps `amount` in cents for
  `createSettlementDeduction`, and `safety-v5.routes.ts:281` recomputes
  `amountCents = Math.round(Number(body.data.amount) * 100)` for the deduction *after* writing dollars to the
  liability at :275. Two units, two names, both correct. A naive "divide the shared variable by 100" would
  have fixed the balance and silently under-withheld real money; it was not done that way.
  **COMPLETENESS — the claim I most wanted to break, and could not.** §9.0.17 requires a sweep to cover every
  site, so I enumerated writers independently instead of trusting "three of the four". Production (non-test)
  `INSERT INTO driver_finance.driver_liabilities` sites number exactly **4**: `cash-advances/
  cash-advance-create.ts:230`, `safety/fines.routes.ts:380`, `safety/safety-v5.routes.ts:262`,
  `safety/safety.routes.ts:918`. Three fixed, one already correct. **No fifth writer exists.**
  **I checked one edge the PR did not mention.** Writer #4 chooses
  `linkedBill ? Number(linkedBill.total_amount ?? body.amount) : body.amount` — so if bills stored cents, that
  branch would carry the identical defect. On prod `accounting.bills.total_amount` is **`numeric(12,2)`** and
  the live distribution settles the unit beyond argument: min **0.01**, max **696,466.47**, mean **3,578.74**
  over **16,250** rows. Cents would put the average carrier bill at $35.79. Bills also carry a separate
  `amount_cents` **bigint**. The branch is dollars. **No residual defect.**
- severity:  none — GUARD verify-after PASS; recorded so this is not re-derived
- LANE:      n/a (verification of CC-1/CC-3 work)
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass in its own statement, exit 0.
             Column types from `information_schema.columns`; liability table counters from
             `pg_stat_user_tables`; bill distribution from `accounting.bills`. Code read from
             `origin/main` @ `66c840c96`, not from a working tree.
- status:    PASS

## LV-096  CHECKSUM GUARD (LV-087 / verify-step 2625) — **PASS: it genuinely blocks renumber-and-reapply.** Proven by planting a real duplicate against the live scanner, not by reading the guard
- module:    db/migrations (GUARD — guard-efficacy test)
- entity:    ALL
- surface:   `scripts/verify-steps/2625-verify-migration-checksum-collision.mjs` · `scripts/verify-migration-checksum-collision.mjs` (landed @ `c47a82f82`, PR #4467)
- observed:  Earlier this session this guard did **not exist** — `2625` was claimed in `CLAIMED-NUMBERS.json`
  with no file, which was correct Rule 37 claim-first behaviour, and I recorded that I could not test it. It
  has since been authored, so the test was run.
  **A guard that cannot fail is theater, so I tested the failure path, not the passing one.**
  **(1) Both legs pass on the clean tree.** `--selftest` → **exit 0**, "8 mutations all detected; baseline
  matches the files it names". Real leg → **exit 0**, "874 migration files scanned; 1 checksum collision(s),
  all 1 of them the frozen pre-existing pair".
  **(2) Independent planted-duplicate test — the one that actually proves it.** The built-in selftest checks
  detection against an in-memory `Map`, which proves the comparison logic but not that the **real scanner**
  walking `db/migrations/` catches a real file. So I copied `0001_audit_init.sql` to
  `9998_cc2_planted_duplicate_DELETEME.sql` — a literal renumber-and-reapply — and re-ran the real leg:
  **exit 1**, with `checksum 81f9eda777af is shared by 2 migration files: 0001_audit_init.sql,
  9998_cc2_planted_duplicate_DELETEME.sql`. It **fails closed and names both files**.
  The planted file was untracked, removed immediately by an `EXIT` trap, and its removal verified
  (`git status --porcelain db/migrations/` clean). **No migration history was touched** — WORM intact.
  **(3) The selftest itself is unusually well built and worth crediting.** Its four mutations do not merely
  assert detection: mutation 2 rejects a runner with no refusal; mutation 3 rejects a runner that merely
  *mentions* checksums, explicitly distinguishing the pre-existing same-filename **drift** check from the
  renumber-and-reapply **collision** check — two different defects that would otherwise be conflated; and
  mutation 4 requires grandfathering to be **exact-set**, so a third file joining an already-baselined
  checksum still fails. That last one is the difference between a frozen baseline and a blanket amnesty, and
  it is the mutation most guards of this shape get wrong.
  **Scope of the claim.** I proved the guard detects a byte-identical duplicate and that `db-migrate.mjs`
  carries the refusal the guard checks for. I did **not** execute a migration against any database, and
  **UNVERIFIED — the runtime refusal path was not exercised live**; testing that would require applying a
  migration, which is out of GUARD's read-only lane and would touch prod.
- severity:  none — guard-efficacy PASS
- LANE:      n/a (verification of CC-1's guard)
- neon-check: none required — this is a static-guard efficacy test executed locally against
             `origin/main` code; exit codes read WITHOUT a pipe (0 / 0 clean, 1 with plant).
- status:    PASS

## LV-097  POSTING-FLAG SWEEP — 75 of 78 (flag × entity) combinations are ON as the law states; the 3 exceptions are all **IH 35 Trucking**, and one of them is **silently EXPIRED while its row still reads `enabled = true`**
- module:    accounting · lib (GUARD — posting-flag state vs owner law)
- entity:    ALL (TRANSP · USMCA · TRK)
- surface:   `lib.feature_flags` × `lib.feature_flag_overrides` × `org.companies`
- observed:  Owner law is that GL posting is ON for all three entities. I verified that against prod rather
  than assuming it. **26** posting flags × **3** entities = **78** combinations; **75 are effectively ON**.
  All **3** exceptions belong to **IH 35 Trucking LLC** (`b49a737b`), and they are three *different* causes —
  which is why a single "is it on?" glance would misread them:
  | flag | stored | effective | cause |
  |---|---|---|---|
  | `FACTORING_GL_POSTING_ENABLED` | **`enabled = true`** | **OFF** | override **EXPIRED 2026-07-27** (9 days ago; today 2026-08-05) → falls back to `default_enabled = false` |
  | `RELATED_PARTY_LOAN_GL_POSTING_ENABLED` | *no row* | OFF | no override exists for TRK → `default_enabled = false` |
  | `REVENUE_RECOGNITION_POST_ENABLED` | `enabled = false` | OFF | explicit OFF |
  **The factoring one is the finding.** Its row says `enabled = true`. Anyone reading the overrides table —
  or a dashboard that renders `enabled` — concludes factoring GL posting is ON for TRK. It is OFF, and has
  been for 9 days, because `expires_at` silently returned it to the default. Stored state and effective state
  disagree, and the stored state is the reassuring one. That is the shape of defect that survives review.
  **I sized the class rather than implying an epidemic.** Of **242** total overrides, exactly **1** carries an
  `expires_at` at all — this one — and it is expired, and it says `enabled = true`. So this is **singular, not
  systemic**. It is arguably *more* likely to be forgotten precisely because it is the only expiring override
  in the system: no one is watching a mechanism that is used once.
  **The third row is probably CORRECT and I am not filing it as a defect.** TRK is the **asset holder**, not
  an operating carrier (`ih35-entity-facts`); freight revenue recognition belongs to the operating entity, so
  `REVENUE_RECOGNITION_POST_ENABLED = false` on TRK is consistent with the entity model. Calling it a defect
  would be the same error as flagging import-origin rows. **Recorded as owner-confirm, not as a fault.**
  **The second row deserves an owner decision, not a fix.** `RELATED_PARTY_LOAN_GL_POSTING_ENABLED` is off on
  TRK only — and TRK, as the asset holder, is the entity most likely to *have* related-party loans. Whether
  that is deliberate or an oversight is a decision, not a fact I can derive. **UNVERIFIED — intent.**
- severity:  major (factoring: stored `enabled = true` while effectively OFF on a money-posting path) ·
             informational (the other two)
- LANE:      CC-1 (money) — decide TRK's factoring posting intent and either renew/remove the `expires_at` or
             set the override explicitly OFF so stored and effective state agree. Guard suggestion: fail
             closed on any `lib.feature_flag_overrides` row where `expires_at < now()` AND `enabled = true` —
             a one-predicate check that makes this class impossible to miss again. **Owner decision needed**
             on `RELATED_PARTY_LOAN_GL_POSTING_ENABLED` for TRK.
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass in its own statement, exit 0.
             26 posting flags × 3 entities enumerated by CROSS JOIN so absent overrides surface as rows
             rather than vanishing from the result — the join shape is what makes the "no row" case visible.
             Override census: **242** total, **1** with `expires_at`, **1** expired, **1** expired-but-enabled.
             `now()::date` asserted as 2026-08-05 in the same transaction.
- status:    OPEN

### LV-091 ADDENDUM — the unmounted-route half is now proven LIVE against prod, with both controls
The original finding established by static analysis that `registerPayrollIntegrationRoutes` is referenced
nowhere outside its own file and that no autoload covers it. That is inference. This is the measurement.

Probed prod (`api.ih35dispatch.com`) with the **404-vs-401 discriminator**: an unmounted route returns 404,
a mounted route that merely rejects an unauthenticated caller returns 401. No credentials needed, so this
proves mounting without touching auth.

| request | result | meaning |
|---|---|---|
| `GET /api/v1/payroll-integration/aggregate` | **404** | declared at `aggregate.routes.ts:40` — **not mounted** |
| `GET /api/v1/payroll-integration/aggregate/refresh` | **404** | declared at `:95` — **not mounted** |
| `GET /api/v1/customers` *(positive control)* | **401** | mounted; a live route rejects auth, it does not 404 |
| `GET /api/v1/definitely-not-a-route` *(negative control)* | **404** | the signature of a route that does not exist |

The payroll endpoints return **exactly** the nonexistent-route code and **not** the mounted-route code. Both
controls were run in the same probe, so the 404 cannot be explained by a global auth filter or by the API
being down. **The routes are declared in shipped code and are unreachable in production.**

This closes the reachability half of LV-091 as CONFIRMED. The phantom-table half was already confirmed
(`to_regclass('accounting.qbo_payroll_links')` → NULL with a non-null control on the same query). Both halves
now rest on measurement rather than reading. The severity stands: fixing only the mount would ship a
guaranteed `42P01` on first call, because the table the handler selects from does not exist.
- neon-check: n/a for this addendum — HTTP probe against prod `api.ih35dispatch.com`; deploy confirmed
  earlier this session at `/api/v1/healthz/shallow` version `94c520a`.
- status:    OPEN (unchanged — CC-1 owns the canonical-target decision)

## LV-098  SYSTEMIC SWEEP of the LV-088 idiom — 8 uses of `operating_company_id IS NULL OR …` in backend reads: **5 correct and load-bearing, 1 comment, 1 the LV-088 defect, and 1 DEAD-BUT-LATENT** in the GL approvals path
- module:    accounting · catalogs · home (GUARD — generalizing LV-088)
- entity:    ALL
- surface:   every non-test `operating_company_id IS NULL OR` in `apps/backend/src`
- observed:  LV-088 is one instance of an idiom that is **correct in most places it appears**, so the useful
  question is not "where is this pattern" but "where is it not justified by the data". §0 requires classifying
  by opco **VALUES**, not column presence, so I read the rows rather than the schema for each site.
  | site | table | prod opco values | verdict |
  |---|---|---|---|
  | `catalogs/accounting/detail-types-catalog.routes.ts` ×4 · `catalogs/accounts.routes.ts:113` | `catalogs.detail_types` | **144 of 144 NULL** | **CORRECT — load-bearing** |
  | `lists/lists-module-count-spec.ts:167` | — | — | N/A — a comment describing policy, not code |
  | `home/scenario-tracker.service.ts:86` | `audit.scenario_status` | per-entity rows + 1 ALL row per key | **DEFECT — LV-088** |
  | `accounting/role-home/pending-approvals-gl.service.ts:491` | `catalogs.accounts` | **0 of 1,444 NULL** | **DEAD TODAY — latent** |
  **`catalogs.detail_types` is the genuine shared-canonical case and the idiom there is required.** Every one
  of its 144 rows has a NULL `operating_company_id` — one system-wide set consumed by all entities. Removing
  the disjunct would blank the catalog for every tenant. Those 5 sites are correct and must not be "fixed".
  **The GL approvals site is the one worth naming, and its severity is *latent*, not active.**
  `catalogs.accounts` holds **1,444** rows across **3** distinct opcos and **zero** NULL-opco rows, so the
  `a.operating_company_id IS NULL` disjunct **cannot match anything today** — it is dead. Nothing is leaking.
  But it encodes the assumption that a NULL-opco account is shared across all entities, and the day one is
  created — by an import, a migration, or a hand-insert — that account silently becomes visible in all three
  entities' GL approval screens with no code change and no alert. It is a leak waiting for a row.
  **I checked whether the leak is already happening rather than reasoning about it:** postings whose account
  belongs to a *different* entity than the posting = **0**. The GL is clean.
  **Why this is a finding at all, given nothing is broken.** LV-088 was the same shape — an `IS NULL` disjunct
  that looked like the harmless catalog idiom — and it was live-wrong across 23 keys and 2 entities. The
  difference between the two sites is a data fact (`0 NULL rows` vs `1 ALL row per key`), not anything visible
  in the code. That is precisely why this must be pinned by a guard rather than by review: the code reads
  identically in the safe case and the unsafe one.
- severity:  minor (latent — 0 rows can trigger it today) · informational (the 5 correct sites, recorded so
             nobody "fixes" them into an outage)
- LANE:      CC-1 (money) — either drop the dead disjunct at `pending-approvals-gl.service.ts:491` (the
             narrower change, since `catalogs.accounts` is entity-scoped by policy) or add a guard asserting
             `catalogs.accounts` has **0** NULL-opco rows, which converts the latent leak into a loud failure.
             **Do NOT touch the 5 `catalogs.detail_types` sites** — they are correct and load-bearing.
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass in its own statement, exit 0.
             `catalogs.accounts` **1,444** total / **0** NULL-opco / **3** distinct opcos;
             `catalogs.detail_types` **144** total / **144** NULL-opco; cross-entity posting→account
             mismatches **0**. Code census by grep over `apps/backend/src/**/*.ts` excluding tests.
- status:    OPEN

### LV-097 CORRECTION — **OWNER RULING 2026-08-05: "trucking does not have factoring."** Severity downgraded major → informational; my original reading was wrong
**Owner decisions outrank my analysis (§0 precedence: FACTS resolve prod > guard > repo > memory, but
DECISIONS are the owner's).** I filed TRK's expired `FACTORING_GL_POSTING_ENABLED` as **major** on the
reasoning that a money-posting flag was silently OFF. That reasoning assumed TRK factors invoices. It does
not. **IH 35 Trucking is the asset holder and has no factoring**, so factoring GL posting being effectively
OFF for TRK is the **correct end state**, not a defect. I am correcting this rather than leaving a wrong
severity standing in the record.

**Corroborated on prod before accepting it** — the ruling and the data agree:
| check (TRK `b49a737b`) | result |
|---|---|
| invoices with `factoring_advance_id` or `factor_profile_id` | **0** |
| invoices with `factoring_status` other than `none` | **0** |
| `factoring.factoring_advances` (all entities) | **0** rows |
| `factoring.factoring_reserve_movements` / `letter_of_release` / `customer_factor_assignment` | **0** rows each |
TRK has **no factoring footprint whatsoever**. Nothing was being under-posted, because there is nothing to post.

**What was wrong in my original write-up:** I treated "flag effectively OFF" as inherently a risk without
first asking whether the entity should ever post that flag. That is the same error as flagging import-origin
rows as unlinked — judging a state against a generic expectation instead of against what the entity actually
does. I applied the origin test rigorously to rows (LV-092) and then failed to apply the equivalent
entity-model test to a flag.

**What survives, narrowed and de-escalated.** One point remains true and is worth keeping only as hygiene:
the override row reads **`enabled = true`** while being effectively OFF. Stored state still disagrees with
effective state. But since the effective state is now known to be **correct**, this is a **record-tidiness
issue, not a money risk** — nobody will be misled into thinking posting is on for a path that should never
post anyway.
**The recommendation therefore INVERTS.** My original advice was to renew or remove the `expires_at`. Renewing
it would be actively wrong — it would turn ON posting for a capability TRK does not have. The correct action
is to **delete the override row or set `enabled = false`**, so the stored record states the owner's actual
intent instead of relying on a lapsed timestamp to produce the right answer by accident.
**The proposed guard still stands and is unaffected** (`expires_at < now() AND enabled = true` → fail closed):
its value is surfacing stored-vs-effective divergence, which was real here regardless of which direction is
correct. It would have surfaced this row for an owner decision months earlier.

**Unchanged by this ruling:** `RELATED_PARTY_LOAN_GL_POSTING_ENABLED` on TRK remains **UNVERIFIED — intent**
(owner decision outstanding), and `REVENUE_RECOGNITION_POST_ENABLED = false` on TRK remains recorded as
consistent with the entity model, not a defect.
- severity:  **informational** (superseded from *major* by owner ruling 2026-08-05)
- LANE:      CC-1 (money) — remove the override row or set it explicitly `enabled = false`; **do NOT renew
             the expiry**
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass in its own statement, exit 0.
             TRK factoring footprint counts as tabulated above.
- status:    SUPERSEDED-BY-OWNER-RULING (factoring row) · LV-097's other two rows unchanged

## LV-099  **LEDGER SAYS APPLIED — EFFECT MISSING.** Migration `0094` is recorded applied in BOTH ledgers, yet all three of its enum labels are absent from prod, and that makes the entire abandonment → escrow-forfeit chain **structurally unreachable**
- module:    dispatch · driver_finance (GUARD — migration effect verification, FAIL CLOSED)
- entity:    ALL
- surface:   `mdata.load_status_enum` · `db/migrations/0094_p5_e1_auto_deduct_escrow_load_abandonment.sql` · `_system._schema_migrations` · `ih35_migrations.applied_migrations`
- expected:  `0094` runs `ALTER TYPE mdata.load_status_enum ADD VALUE IF NOT EXISTS` for **`abandoned`**,
             **`driver_walkoff`**, **`driver_no_show`**. Recorded-applied should mean those labels exist.
- observed:  **All three labels are ABSENT from prod, while both ledgers say the migration was applied.**
  | ledger | row for `0094…abandonment.sql` | applied_at | applied_by |
  |---|---|---|---|
  | `_system._schema_migrations` | **present** | 2026-05-12 01:42:05 | `neondb_owner` |
  | `ih35_migrations.applied_migrations` | **present** | 2026-05-23 16:10:16 | **`claude-backfill-2026-05-23`** |
  `mdata.load_status_enum` carries **17** labels and none is one of the three. Verified schema-qualified —
  it is the only `%load_status%` type on prod with any labels at all (`catalogs.driver_load_statuses` and the
  array types have 0), so this is not a wrong-type mix-up.
  **The two ledgers also disagree with each other** (applied 11 days apart; 876 vs 883 total rows), and the
  second entry's `applied_by` is a **backfill**. That is the most probable mechanism: the ledger row was
  *inserted to mark the migration applied* rather than produced by executing it. **A ledger row is an
  assertion, not evidence.**
  **PROOF THE EFFECT IS MISSING — read-only, no write performed.** Casting the literal is enough:
  `SELECT 'abandoned'::mdata.load_status_enum` → **`ERROR: invalid input value for enum
  mdata.load_status_enum: "abandoned"`**. Positive control in the same session:
  `SELECT 'cancelled'::mdata.load_status_enum` → returns `cancelled`. So the cast mechanism works and
  **only these labels are missing**.
  **THE CONSEQUENCE IS THE FINDING: the abandonment write path CANNOT SUCCEED — not "has not yet", CANNOT.**
  The escrow machinery is fully wired: trigger **`trg_auto_propose_escrow_on_abandon` exists on
  `mdata.loads`**, `dispatch.load_abandonments` exists, `abandonment_chargebacks` has its audit trigger. But a
  load can never *enter* the status that fires the trigger, because `UPDATE mdata.loads SET status =
  'abandoned'` throws on the enum before any trigger runs. Confirmed by the counters:
  `dispatch.load_abandonments` **0 rows with `n_tup_ins = 0`** (never inserted in the table's lifetime), and
  `mdata.loads` in an abandon status **0**. The `n_tup_ins = 0` is what turns "empty" into "never once".
  **The team already knew, and worked around the symptom instead of the cause.** Migration
  `202610291200_disp01_escrow_abandon_trigger_text_cast.sql` (applied 2026-07-30) states in its own header:
  *"literals abandoned/driver_walkoff/driver_no_show that do NOT exist on prod mdata.load_status_enum …
  FIX: compare as ::text"*. That change stopped the **trigger definition** from erroring — it did **not**
  make the path reachable, because the blocking cast is on the `UPDATE`, not inside the trigger body. The
  workaround is why this has stayed invisible: nothing errors any more, and nothing works either.
  **Answering the assigned question directly: I could NOT confirm the abandonment path end-to-end, because
  end-to-end success is impossible in the current prod state.** I did not attempt a write — GUARD is
  read-only, and the enum cast proves the outcome without one.
  **Status of CC-1's expected enum migration: NOT YET LANDED.** Latest `origin/main` is `07daa0f6b`; no new
  migration adds these labels. This finding is the **baseline**. When CC-1's migration deploys, re-run exactly
  this check — the three-label `EXISTS` probe plus the `::mdata.load_status_enum` cast — and the ledger row
  must NOT be accepted as proof.
- severity:  **critical** (a merged, twice-recorded migration never took effect; an entire money path —
             escrow forfeit / abandonment chargeback — is unreachable and silently so)
- LANE:      CC-1 (money/migrations) — add the three labels via a NEW forward migration (never re-run or
             renumber `0094`; §2 + LV-087). `ALTER TYPE … ADD VALUE` cannot run inside a transaction block in
             older PG, which is the most likely reason the original silently did not take — `0094` wraps its
             body in `BEGIN;`. **Guard must assert the three labels EXIST on prod**, not that the migration is
             ledgered — a ledger-based guard would have passed throughout.
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass in its own statement.
             Three-label presence probe → `false`/`false`/`false`. Cast probe → error 22P02 as quoted;
             positive control `'cancelled'` → success. `mdata.load_status_enum` label count **17**.
             Ledger rows as tabulated. `dispatch.load_abandonments` 0 rows / `n_tup_ins` **0**.
             Trigger `trg_auto_propose_escrow_on_abandon` confirmed present on `loads` via `pg_trigger`.
- status:    OPEN

## LV-100  GUARD VERIFY-AFTER of **ACCT-F115** (#4478, `c8b6a3cbb`) and **ACCT-F116** (#4479, `07daa0f6b`) — **both PASS**; every factual claim in both PRs independently re-verified on prod
- module:    accounting · insurance · driver_finance (GUARD — post-merge verification)
- entity:    ALL
- surface:   `insurance.claim` · `accounting.insurance_claim_recovery_postings` · `accounting.escrow_postings` · `accounting.chart_of_accounts_roles` → `catalogs.accounts`
- observed:  Both PRs add executable proof for a money hop and change **no production code**. That makes the
  PR body itself the load-bearing artifact, so I re-derived every number rather than reading them.
  **ACCT-F115 (insurer claim recovery) — all claims hold.**
  | claim | verified |
  |---|---|
  | `insurance.claim` = 0 rows | **0**, `n_tup_ins` **0**, `n_tup_del` **0** |
  | `accounting.insurance_claim_recovery_postings` = 0 | **0**, `n_tup_ins` **0**, `n_tup_del` **0** |
  | `insurance_recovery` → 6155 [OtherExpense] on all three | **confirmed**, active, all 3 entities |
  | `INSURANCE_CLAIM_RECOVERY_GL_POSTING_ENABLED` true ×3 | **confirmed** — independently, in LV-097's sweep |
  The `n_tup_ins = 0` on both tables is stronger than the PR's own `n_live_tup 0 / n_tup_del 0`: it shows the
  rows were never there rather than merely absent now.
  **ACCT-F116 (new-hire driver escrow) — all claims hold, including the one that matters.**
  `accounting.escrow_postings` **0** with `n_tup_ins` **0**; `accounting.escrow_accounts` **0**. The critical
  property — escrow is money **held in trust**, a liability owed back to the driver — is correct in all three:
  | entity | account | type |
  |---|---|---|
  | IH 35 Transportation | QBO-250 "2025-Damage Claim Escrow" | **Liability** |
  | IH 35 Trucking | QBO-1150040187 "Damage Claim Escrow" | **Liability** |
  | USMCA Freight | 2100 "Driver Escrow - Held in Trust" | **Liability** |
  Not one resolves to Income or to a contra-expense, so the failure the PR names — booking a driver's own
  money as company earnings — is not present.
  **One thing the PRs did not mention, which I checked and cleared.** USMCA carries **two** rows for
  `escrow_liability_default`, one `is_active = false` and one `true`. That is the LV-088 shape — two candidate
  rows and a resolver picking one — so I did not assume it was benign. System-wide: **131** role rows across
  **114** distinct (entity, role) pairs, so 17 extras exist; and **pairs with more than one ACTIVE row = 0**.
  Every pair resolves to exactly one active binding. The extras are deactivated history (11 of the 14
  multi-row pairs point at a genuinely *different* account, i.e. the role was re-pointed over time and the old
  binding was retired rather than deleted) — correct void-not-delete behaviour under rule 07, **not a defect**.
  Recording it so the next agent who finds duplicate role rows does not file it as one.
- severity:  none — both verify-after PASS
- LANE:      n/a (verification of CC-1/CC-3 work)
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass in its own statement, exit 0.
             All counts as tabulated; role bindings joined through `catalogs.accounts` for `account_type`.
- status:    PASS

## LV-101  **26 posting flags are ON, but only 11 source types have ever produced a journal line** — most of the enabled money surface has zero live execution evidence
- module:    accounting (GUARD — coverage of the money surface)
- entity:    ALL (3 entities carry journal entries)
- surface:   `lib.feature_flags` (`%POST%`) vs `accounting.journal_entry_postings.source_transaction_type`
- observed:  Verifying F115 and F116 exposed a pattern larger than either. Both describe a hop that is
  **built, wired and flag-enabled but has never executed**, and that is not two isolated cases.
  **26** posting flags are defined and (per LV-097) effectively ON across the entities, with 3 known TRK
  exceptions. Against that, **11** distinct `source_transaction_type` values have *ever* written a posting
  line: `fuel_event` (3,094), `bank_categorization` (380), `bill` (10), `invoice` (10), `transfer` (8),
  `prepaid_purchase` (4), `fixed_asset_depreciation` (4), `expense` (4), `loan_payment` (3), `bill_payment` (2),
  `customer_payment` (2).
  **I am stating this as a coverage measurement, not a defect, and the distinction matters.** Flags do not map
  one-to-one onto `source_transaction_type`, so "26 minus 11" is **not** a count of broken paths and I am not
  presenting it as one. What is exactly true: the great majority of GL volume is two paths (`fuel_event` and
  `bank_categorization` are **3,474 of 3,603** lines, **96%**), and most enabled posting capabilities have
  produced **no** live evidence at all.
  **Why this is worth a finding rather than a shrug.** A flag that is ON is an assertion that the path is
  ready. For most of these the only thing standing behind that assertion is code review — and LV-099 is the
  proof of what that is worth: a migration recorded applied in **both** ledgers whose effect never reached
  prod, sitting under a money path (escrow forfeit on abandonment) that **cannot execute at all**. That defect
  was invisible for ~3 months precisely because nothing had ever run it.
  **So ACCT-F115/F116 are the correct response to this, not a formality.** An executable scenario test is the
  only mechanism that exercises a path with no production data, and it catches exactly the properties that
  only fail under real data — F116's Liability-type binding and over-draw guard, F115's ASC 450-30 / 610-30
  recovery cap. **The right conclusion is to continue that pattern across the remaining enabled paths**,
  prioritising the ones with zero postings, rather than to treat flag-ON as evidence of readiness.
- severity:  informational (coverage measurement; no defect asserted)
- LANE:      CC-1 (money) — extend the F115/F116 executable-scenario pattern to the enabled posting paths that
             have never executed; treat LV-099 as the worked example of what zero-execution conceals
- neon-check: prod `br-fancy-credit-akjnd07a`, bypass in its own statement, exit 0. Posting flags defined
             **26**; distinct non-null `source_transaction_type` ever posted **11**; entities with journal
             entries **3**; per-type line counts as listed (totalling the 3,603 lines of LV-092).
- status:    OPEN (informational)

## LV-102  GUARD VERIFY-AFTER of **ECON-012** (Cascade, #4480, `bfe795f2a`) — **CONFIRMED**, with one material refinement: the PERMIT gap is real but has **never mis-posted**, because zero PERMIT bill lines exist
- module:    accounting (GUARD — verification of an audit claim)
- entity:    ALL
- surface:   `apps/frontend/src/components/accounting/vendorBillLines.ts` · `catalogs.expense_categories` · `accounting.expense_category_account_map` · `accounting.bill_lines`
- observed:  Every factual claim in the ECON-012 write-up holds:
  | claim | verified on prod |
  |---|---|
  | picker catalog offers 3 codes across 3 entities | **FUEL 3 / PERMIT 3 / REPAIR 3** = 9 rows, 3 entities each |
  | canonical GL map supports 30 codes | **30** distinct active `category_code` over **82** rows |
  | translation handles only FUEL and REPAIR | confirmed in source — `mapExpenseCatalogCodeToBillCategory` returns `fuel`, `maintenance`, else **`null`** |
  So PERMIT genuinely falls through to `return null`, keeping `expense_category_uuid` only, which the poster
  treats as uncategorized. **The defect is real.**
  **The refinement — and it changes the severity, not the diagnosis.** `accounting.bill_lines` joined to the
  catalog gives **FUEL 0 · PERMIT 0 · REPAIR 4**. **No PERMIT bill line has ever been created**, so nothing
  has been mis-posted to uncategorized. The wording "PERMIT posts uncategorized to GL" describes a mechanism
  that is correct in principle but has **never fired**. This is prospective misposting, not a corrupted ledger
  — there is nothing to restate, and the fix is cheap for exactly that reason.
  **Worth saying plainly: the fallback is the RIGHT default.** The code comment states the intent — *"Unknown
  codes keep `expense_category_uuid` only (poster → uncategorized) — never invent a GL account."* Falling back
  to uncategorized rather than guessing an account is correct behaviour under the no-invented-GL rule. The
  defect is the **missing PERMIT entry**, not the fallback that catches it.
  **Same shape as LV-098 and worth noting as a pattern:** a real gap whose blast radius is currently zero
  because no data exercises it. Both should be fixed while that is still true.
- severity:  minor (latent — 0 rows affected today; would become a live misclassification on the first PERMIT bill)
- LANE:      CC-1 (accounting) — add the PERMIT translation, or document why PERMIT is deliberately excluded;
             separately decide whether the 3-code picker should expand toward the 30-code canonical map
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass in its own statement, exit 0.
             Counts as tabulated; `bill_lines` joined via `expense_category_uuid`.
- status:    OPEN (confirmed; severity refined from the original write-up)

## LV-103  **14 of 25 guard scripts cited by `docs/audit/wave-queue.json` DO NOT EXIST** — including the one named as ECON-012's own guard. A card's `guard_green` has never reflected a run that could happen
- module:    docs/audit · scripts (GUARD — guard theater at scale)
- entity:    ALL
- surface:   `docs/audit/wave-queue.json` guard references vs `scripts/**/*.mjs` on `origin/main`
- observed:  Cascade noticed one instance while working ECON-012 — *"`scripts/verify-orphan-surface-drill.mjs`
  referenced by the wave card does not exist on disk (MODULE_NOT_FOUND) — the card's `guard_green:false` has
  never reflected a real guard run."* **Credit where due: that observation is correct and it is what prompted
  this sweep.** It is also not one card. It is most of them.
  Of **25** distinct guard scripts referenced by `wave-queue.json`: **10** exist at the cited path, **1** was
  renamed (`verify-disp-wire-04-invoice-evidence.mjs` → `…-durable.mjs`, a real guard, correctly counted as
  present), and **14 do not exist anywhere under `scripts/`** — checked by basename across the whole tree,
  including the numbered `verify-steps/` scheme, so a renumbering would not be miscounted as absence:
  `verify-disp-wire-06-load-expense-link` · `verify-disp-wire-07-departure-evidence` ·
  **`verify-econ-empty-density`** · `verify-gl-posting-coverage` · `verify-hooks-before-return` ·
  `verify-money-hold-surfaces` · `verify-money-ops-fk-density` · `verify-no-raw-uuid-inputs` ·
  `verify-no-silent-list-cap` · `verify-no-uuid-labels` · `verify-orphan-surface-drill` ·
  `verify-qbo-canonical-recon` · `verify-reverse-linkage-embedded` · `verify-silent-success-posting-output`.
  **The sharpest instance is self-referential.** `verify-econ-empty-density.mjs` is listed under `GUARD:` in
  the ECON-012 PR body itself, described as the "existing CLS-ECON-EMPTY guard". **It does not exist.** A guard
  that is absent from disk cannot have run, so it contributed nothing to that finding's proof — the finding
  stands on its SQL and code reading, which I independently confirmed in LV-102, not on the guard.
  **Why this matters more than a broken path.** `wave-queue.json` is a drain queue whose cards carry a
  `guard_green` field. For these 14, that field can only ever be `false` — never because the guarded defect is
  present, but because the guard cannot be invoked. A permanently-`false` signal is indistinguishable from a
  genuinely failing one, and a card can never drain. The names are also the money-critical ones:
  `gl-posting-coverage`, `money-ops-fk-density`, `money-hold-surfaces`, `silent-success-posting-output`,
  `reverse-linkage-embedded`, `qbo-canonical-recon`.
  **This is the same failure class as LV-099, one layer up.** There, a ledger row asserted a migration had
  been applied when its effect was absent. Here, a card asserts a guard governs a defect when the guard is
  absent. **Both are records that assert a fact nobody re-checked against reality** — which is precisely why
  §0 requires proving the effect rather than trusting the record.
  **What I am NOT claiming.** I did not verify whether these 14 were ever written and later removed, or were
  only ever aspirational names. Either way the current state is the same and the remedy is the same. I also
  did not audit guard references outside `wave-queue.json`.
- severity:  major (the audit system's own proof mechanism is absent for 56% of its cited guards, concentrated
             on money-critical checks)
- LANE:      CASCADE (owns `wave-queue.json`) with CC-1 for the money-critical guards — either author the 14
             guards or remove/annotate the references so `guard_green` means something. **A meta-guard is the
             durable fix:** assert every guard path referenced by `wave-queue.json` resolves on disk, so a
             card can never again cite a guard that cannot run.
- neon-check: none required — this is a repo/filesystem verification against `origin/main`; guard existence
             checked by basename across `scripts/**/*.mjs` recursively, not by exact path alone, so renames
             are correctly excluded from the absent count.
- status:    OPEN

## LV-104  §10 BOTH-WAY LINKAGE — **PASS, complete**: every one of the 3,521 source-bearing posting lines resolves to a live source, and `transaction_source_links` covers all of them. **This CORRECTS LV-092, which overstated the gap.**
- module:    accounting (GUARD — §10 linkage law, full-coverage proof)
- entity:    ALL
- surface:   `accounting.journal_entry_postings` ↔ source tables ↔ `accounting.transaction_source_links`
- observed:  I previously verified only invoice and bill (10 lines each). That left **96% of GL volume
  unverified**, so I finished the job across every source type.
  **(1) Direct resolution — every typed line resolves to a live source row, 0 dangling:**
  | source type | lines | dangling |
  |---|---|---|
  | `fuel_event` → `fuel.fuel_transactions` | **3,094** | **0** |
  | `bank_categorization` → `banking.bank_transactions` | **380** | **0** |
  | `invoice` → `accounting.invoices` | 10 | 0 |
  | `bill` → `accounting.bills` | 10 | 0 |
  | `expense` → `accounting.expenses` | 4 | 0 |
  | `bill_payment` → `accounting.bill_payments` | 2 | 0 |
  | `customer_payment` → `accounting.payments` | 2 | 0 |
  **(2) The canonical linkage table is complete in BOTH directions.**
  `accounting.transaction_source_links` holds **3,582** rows with `n_tup_ins = 3,582` (nothing ever deleted).
  Forward: postings with **no** link = **30**. Reverse: links pointing at a **missing posting = 0**.
  **Every posting carrying a `source_transaction_type` has a link — the 30 unlinked are ALL null-source.**
  **(3) The 30 unlinked are 100% `source='manual'` — EXPECTED STATE.** A manual journal entry *is* the source
  document; there is no upstream transaction to point at. Filing these would be the
  expected-state-recorded-as-failure anti-pattern.
  **★ CORRECTION TO LV-092 — I overstated that finding, and this is the evidence that shows it.**
  LV-092 reported that the 44 reversal lines had **no line-level traceability** because `reversal_of_line_id`
  is populated on 0 of 3,603 rows, and treated the 4 revrec lines as a real gap. Both claims were wrong in
  their conclusion, though the underlying observation was accurate:
  - **All 44 reversal lines DO carry a link** — `linked_object_type='journal_entry'`,
    `relationship_role='reversal_of'`, count **44**, an exact match to the 44 reversal lines.
  - **The 4 revrec lines and the 2 fuel-card-overage lines also carry links** — they are absent from the
    unlinked set of 30, which is entirely manual.
  `reversal_of_line_id` being 0-populated **is still true**. What was wrong was my inference that this meant
  traceability was missing. It is not missing; it lives in `transaction_source_links`, which is the **§10
  canonical mechanism** — the links table is where the linkage law says the relationship belongs, not a
  denormalised column on the posting row. **I checked one mechanism, found it empty, and concluded absence
  without checking the canonical one.** That is precisely the error §0 warns about, and it is the same shape
  as trusting a ledger row (LV-099) or a `guard_green` field (LV-103): reading one record instead of proving
  the fact.
  **Net effect on LV-092:** its traceability claim is **withdrawn**. What survives is narrow and cosmetic —
  `reversal_of_line_id` and `reversed_by_line_id` exist as columns and are never written. That is dead schema,
  not a linkage defect, and it does not warrant the *major* severity I assigned.
- severity:  none for the linkage itself (**PASS**) · LV-092 downgraded to **minor/cosmetic** (unused columns)
- LANE:      CC-1 (money) — no linkage work required. Optionally decide whether `reversal_of_line_id` /
             `reversed_by_line_id` should be populated or dropped as dead schema; **not** a correctness issue
             either way, since `transaction_source_links` already carries the relationship.
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass in its own statement, exit 0.
             Per-type dangling counts as tabulated; `transaction_source_links` **3,582** rows /
             `n_tup_ins` **3,582**; postings without a link **30**, all `source='manual'`; links pointing at a
             missing posting **0**; `journal_entry`/`reversal_of` links **44** matching the 44 reversal lines.
- status:    PASS (supersedes the traceability claim of LV-092)

## LV-105  REVREC LATCH (Phase-1 hop 6 / WIRE-05) — **PASS on all three layers**: the GL shape is correct ASC 606, the status-driven firing defect is CLOSED, and ACCT-F66's stale-latch fix is proven by DIFFERENTIAL on the real prod rows (old predicate latches 2, new latches 0)
- module:    accounting · dispatch (GUARD — Phase-1 money hop verification)
- entity:    TRANSP
- surface:   `accounting/revrec-delivery-posting/poster.service.ts` · `accounting.load_revenue_recognition_postings` · `accounting.journal_entries`
- observed:  This is the only Phase-1 money hop with real GL evidence behind it, so I verified all three layers
  rather than the one that was asked about.
  **(1) The double entry is textbook ASC 606 — verified from the posted lines, not from the design doc.**
  | event | debit | credit | amount |
  |---|---|---|---|
  | Event 1 *earn* | `1240 Unbilled Revenue` [**Asset**] | `4100 Freight Revenue` [**Income**] | $15,000.00 |
  | Event 2 *bill* | `QBO-45 Accounts Receivable` [**Asset**] | `1240 Unbilled Revenue` [**Asset**] | $15,000.00 |
  Earn recognises revenue against a contract asset; bill reclassifies the contract asset to A/R. Net effect
  DR A/R / CR Revenue. Both entries balance (part of the 1,787 in LV-089) and every account carries the
  correct type — revenue is not booked to an asset, and the unbilled leg is not booked to income.
  **(2) The defect that caused these two entries to be reversed is CLOSED.** The owner-authorised reversal
  memo recorded that revrec had *"posted off load status with zero delivery evidence… no POD exists and none
  will be fabricated."* The current poster refuses that: Event 1 may only earn when the **final active
  delivery stop carries a real `actual_departure_at`**, with an explicit `missing_delivery_evidence` refusal.
  The reasoning in the source is exactly right and worth preserving here — `mdata.loads.status` is written
  from **8 separate code paths, three of which reach `delivered_pending_docs`+ by validating only a status
  graph without ever reading `mdata.load_stops`**; the only path that *captures* delivery evidence never
  triggered the latch, and the only path that *triggered* it captured no evidence. Gating on evidence rather
  than on status closes the inversion regardless of which status writer fires.
  **(3) ACCT-F66's stale-latch fix — PROVEN BY EFFECT, not by reading it.** The residual documented in the
  source is real and still visible on prod: both subledger rows (`earn`, `bill`) remain `is_active = true`,
  `status = 'posted'`, `voided_at = NULL`, even though their journal entries carry `reversed_by_je_id`.
  Nothing ever set `is_active = false`. Under a naive `is_active`-only check that load could **never**
  re-recognise: Event 1 would refuse with `already_posted`, the revenue would be **lost silently**, and the
  ACCT-F59 invoice interlock would refuse that load's invoice forever.
  I ran the shipped predicate against those exact rows. **Differential result:**
  | predicate | rows that latch |
  |---|---|
  | old, naive (`p.is_active` alone) | **2** |
  | ACCT-F66 `STANDING_LATCH_JE_PREDICATE` (`is_active` AND `je.voided_at IS NULL` AND `je.reversed_by_je_id IS NULL`) | **0** |
  Per row, both `earn` and `bill` return `naive = true` / `standing = false`. **The fix demonstrably works on
  the live data it was written for**, and load `L-20260624-0083` is not blocked.
  **Why the declarative approach is the right one and worth recording.** ACCT-F66 derives "is this latch
  standing?" from the journal entry's own reversal state instead of requiring every reversal path to remember
  to flip a subledger flag. There is no hook to forget. Given LV-099 — where a migration's effect never
  landed because a step was assumed to have run — a design with no step to miss is the stronger pattern.
- severity:  none — verify-after PASS on all three layers
- LANE:      n/a (verification of CC-1 work)
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass in its own statement, exit 0.
             Revrec JE lines and account types joined through `catalogs.accounts`. Latch rows: 2, both
             `is_active` true with `reversed_by_je_id` non-null on their JEs. Differential predicate counts
             **2** (naive) vs **0** (ACCT-F66) executed as SQL against those rows.
- status:    PASS

## LV-106  BANK PATH (Phase-1 hop 9 / WIRE-10) — **WIRING PASS, proven three ways and both directions**; density is 1.5% and is an ops backlog, correctly NOT claimed as green
- module:    banking · accounting (GUARD — Phase-1 money hop verification)
- entity:    ALL
- surface:   `banking.bank_transactions` ↔ `accounting.journal_entries` ↔ `accounting.journal_entry_postings`
- observed:  The delivery plan anticipated exactly this split for hop 9 — *"Match/categorize wiring proven;
  density may be ops backlog (named)"* — so I separated the two rather than reporting one number.
  **(1) The wiring is correct, and the three independent counts agree exactly:**
  | measure | count |
  |---|---|
  | transactions with `categorized_at` set | **170** |
  | transactions with `matched_journal_entry_id` set | **170** |
  | distinct bank transactions appearing as a posting source | **170** |
  Three separate tables agreeing on 170 is a stronger statement than any one of them: a transaction does not
  get categorized without producing a journal entry, and does not get a journal entry without producing
  posting lines that name it. The 380 posting lines over 170 transactions (≈2.2 each) is consistent with
  split categorizations.
  **(2) Both directions resolve, 0 orphans either way.** Forward (LV-104): all **380**
  `bank_categorization` posting lines resolve to a live `banking.bank_transactions` row, **0** dangling.
  Reverse: bank transactions whose `matched_journal_entry_id` points at a **missing** journal entry = **0**.
  Nothing is matched to a JE that does not exist, and nothing posts from a transaction that does not exist.
  **(3) Density is 1.5%, and that is an operations fact, not a defect.** **170 of 11,064** transactions are
  categorized. The remaining 10,894 are uncategorized imported bank feed — the same origin class as the
  16,245 QBO-cloned bills and the 1,548 relay-ingest fuel rows (§0 origin ruling). **Categorizing them is
  bookkeeping work, not engineering work**, and "fixing" it in code would mean inventing categorizations.
  **(4) The tracker is telling the truth about this hop.** `matched_invoice_id` is **0** across all 11,064
  rows, and the Bank path slice reads **MERGED**, not PASSED, with evidence *"0 customer payment(s) matched to
  an invoice"*. That is honest reporting of an unexercised leg — the wiring exists, the customer-payment
  matching leg has never run. Worth stating plainly because it is the opposite of the LV-088 failure: here
  the board declines to claim green it has not earned.
  **Also clean:** `voided_at` non-null = **0** and `reconciliation_cleared` = **0** — no voided transactions
  distorting the counts, and no reconciliation has been run (consistent with the owner's standing
  RECONCILE-FROZEN instruction, §9.0 item 15).
- severity:  none — wiring verify PASS; density recorded as a named ops backlog, not filed as a defect
- LANE:      n/a (verification) — the 10,894 uncategorized transactions are an operations task for the owner's
             bookkeeping lane, and are explicitly **out of scope** until the owner says "reconcile"
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass in its own statement, exit 0.
             `banking.bank_transactions` total **11,064** (credits 2,742); categorized **170**;
             `matched_journal_entry_id` set **170**, dangling **0**; distinct bank txns appearing as a
             posting source **170**; `matched_invoice_id` **0**; `reconciliation_cleared` **0**; `voided_at` **0**.
- status:    PASS (wiring) · density named, not a defect
