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
  **The row states its own cause.** Its `notes` read `relay_bridge=1; relay_txn=txn_jLbEWkKpRUxwM; merchant=Love's; load_unresolved=1; vendor_unmatched=1`, and `vendor_id`, `load_id`, `driver_id` and `fuel_card_id` are all NULL (`unit_id` is set). The poster requires a matched vendor to build the A/P credit, found none, and skipped the row. `load_required` is false with `load_exemption_reason = PRE_TMS_DISPATCH_IMPORT`, so the missing load link is a sanctioned exemption — the **vendor** is what blocked posting.
  **Why a $197.03 gap is worth a finding.** The amount is immaterial; the mechanism is not. Nothing surfaces this row as unposted — no alert, no queue, no counter. It is discoverable only by doing exactly what I did here: differencing the subledger against the GL. That places it in the same class as LV-027 (36,468 unalerted scheduled-report failures), LV-013 (an invoice reaching `sent` with no queue row) and LV-035 (a 500 rendered as "feature not enabled") — a failure presented as a non-event. Every future Relay fuel purchase whose merchant does not match a vendor will silently miss the GL the same way, and because Relay is a live daily feed the count grows on its own. Today it is 1 of 1,548 (0.06%); the number that matters is that the correct value is 0 and there is no signal when it moves.
  This also gives the fuel poster a clean bill on the part that matters most: of 1,548 events it posted 1,547 correctly and balanced (all 1,787 JEs are DR=CR per LV-050), and it did **not** invent a vendor or post to a fallback account to force the one problem row through — it declined to post, which is the right behaviour. The defect is purely that declining is silent.
- severity:  minor by amount ($197.03), **major by class** — an unmonitored silent-skip path on a live daily feed
- LANE:      CC-1 (money/fuel) — surface unposted fuel events as a visible queue or counter; the vendor match for merchant "Love's" is the immediate data fix
- neon-check: prod `br-fancy-credit-akjnd07a`, `current_user=ih35_app`, bypass its own statement. `fuel_event` A/P postings 1,547 with 1,547 distinct `source_transaction_id` and 0 NULL; forward resolution 3,094/3,094 against `fuel.fuel_transactions`; `fuel.fuel_transactions` total 1,548; unposted count **1**, full row quoted above.
- status:    OPEN
