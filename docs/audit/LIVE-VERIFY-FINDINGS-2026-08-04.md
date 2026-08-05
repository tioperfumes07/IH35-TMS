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
