# C13 — INVENTORY: jsonb / array id holders where an ENFORCED FK is required

**Status:** INVENTORY ONLY. Nothing in this file has been fixed, and nothing in it may be fixed from
this document alone. No FK was added, no migration authored, no writer repointed.
**Produced by:** the C1 picker-law sweep (PRs #3563 guard / #3566 fix), 2026-07-26.
**Why C1 produced it:** C1's acceptance bar already FAILS a picker that writes a jsonb memo, a text
column, or a different table than it reads instead of an enforced FK. Every time it failed one, it was
standing on an instance of a *different* class. C1 was walking these files anyway; this is that
inventory, captured rather than discarded.

---

## THE DEFECT CLASS

A column stores the identifier(s) of rows in ANOTHER table, but stores them inside a `jsonb`/`json`
column or a `uuid[]`/`text[]` array — so **PostgreSQL cannot put a FOREIGN KEY on it**. Integrity is
therefore either an application-level check, a trigger, or nothing at all. It is never the database.

**An id ARRAY is worse than a scalar.** A partial delete on the target table leaves silent dangling
members that no constraint can catch and no error surfaces: the row still exists, the list is just
quietly shorter or points at nothing.

**The canonical precedent** (owner-supplied, verified below): `catalogs.maintenance_vendors` keeps
`mdata_vendor_id` INSIDE a `metadata` jsonb with an app-level existence check only.

---

## ⚠ VERIFICATION SCOPE — READ BEFORE ACTING ON ANY ROW

This sweep is **REPO-ONLY**: `db/migrations/*.sql` plus `apps/` source, at worktree HEAD `965034d1ab`.
**No database was touched** (agents are not permitted to). Under §10(b) *prod wins over migrations*,
and prod has diverged from `db/migrations/` before.

> **Every "this column exists / has no FK" statement below is UNVERIFIED against the Neon prod branch.**
> A later sweep MUST confirm each holder against `information_schema` / `pg_catalog` before acting.

Two rows carry a *migration header* that records a prod check; those are marked inline. Everything
else is repo-truth only. Every `file:line` citation was read during the sweep.

**Structural note:** because no FK is possible on an array element or a jsonb key, `integrity
enforced?` below is never "DB FOREIGN KEY". A grep for validating triggers/CHECK constraints on all
of these column names across `db/migrations/*.sql` found **none** (the only related trigger is
unrelated: `mdata.enforce_active_driver_team_membership()`, `db/migrations/0037_driver_teams.sql:32`).

**Independent spot-verification.** The sweep was run by a research pass; the six highest-consequence
claims were then re-read directly against source before this file was committed, and all six hold
exactly as stated:

| claim | re-read at | confirmed |
|---|---|---|
| C13-03 posting engine resolves a bill's GL account from jsonb | `accounting/posting-engine.service.ts:686-700` | ✅ `COALESCE(metadata->>'account_id', ->>'account_uuid', ->>'coa_account_id')` |
| C13-07 journal postings insert an unchecked jsonb account id | `accounting/recurring.worker.ts:289` | ✅ `String(p.account_id)` inserted directly |
| C13-08 the column holds non-uuid sentinels | `accounting/recon/recon-engine.service.ts:64`, `:72` | ✅ `id: "window"` |
| C13-09 the bridge jsonb is written in the same UPDATE that moves revenue | `dispatch/detention.service.ts:252-262` | ✅ `SET rate_total_cents = COALESCE(...) + $2, quicksave_pending_fields = ... 'accessorial_bridge_rows'` |
| C13-23 R2 object keys are written into an evidence-**id** column | `safety/incidents/full-report.service.ts:140-141` | ✅ `add(evidenceCol, input.photo_keys.filter(isUuid))` |
| a CI guard pins C13-09 in place | `scripts/verify-dispatch-detention-board.mjs:57` | ✅ `if (!service.includes("accessorial_bridge_rows")) failures.push(...)` |

Rows not in that table are single-pass research findings: the citations are precise, but treat them
as "verify before acting", exactly like the prod caveat above.

---

## TOTALS

| metric | count |
|---|---|
| findings | **31** |
| distinct holder columns | **39** |
| id ARRAYS (higher severity) | **33 of 39 columns** |
| integrity enforced NOWHERE AT ALL (highest severity) | **12 findings** |
| financial / money-path findings | **6** (C13-03, -06, -07, -08, -09, -18) |
| dead columns (no writer and no reader) | **3** (C13-15, -22, -28) |

Counts differ because C13-02 covers 3 columns, C13-04 covers 3, and C13-17 covers 5.

---

## TIER 1 — INTEGRITY ENFORCED NOWHERE AT ALL

Not even a uuid *format* check, or a check structurally unable to help. Ordered by consequence.

| # | holder | shape | target | why it is tier 1 |
|---|---|---|---|---|
| C13-03 | `catalogs.expense_categories.metadata` | scalar in jsonb | `catalogs.accounts` | **the GL account the posting engine bills to**, stored as unvalidated jsonb |
| C13-07 | `accounting.recurring_templates.template_payload` | scalar + ARRAY | `catalogs.accounts`, `mdata.vendors`, `mdata.customers` | a cron materializes **journal entries** from unchecked jsonb account ids |
| C13-08 | `accounting.recon_exceptions.source_ref` | scalar in jsonb | polymorphic ×5 | provably holds **non-uuid sentinels** (`id: "window"`) |
| C13-09 | `mdata.loads.quicksave_pending_fields` | ARRAY in jsonb | `dispatch.detention_events`, `mdata.loads` | written in the **same UPDATE that moves `rate_total_cents`** |
| C13-02 | `safety.company_violations.related_drivers` / `_units` / `_fine_ids` | ARRAY in jsonb | `mdata.drivers`, `mdata.units`, `safety.civil_fines` | PATCH writes RETIRED jsonb while every list reads the junctions (**SAF-B28**) |
| C13-04 | `safety.integrity_alerts.related_load_ids` / `_wo_ids` / `_safety_event_ids` | ARRAY in jsonb | `mdata.loads`, `maintenance.work_orders`, safety events | `z.unknown()`, no reader, target not resolvable from source |
| C13-05 | `safety.drug_pool_selections.selected_driver_ids` | ARRAY in jsonb | `mdata.drivers` | write-only FMCSA random-selection evidence |
| C13-10 | `dispatch.load_templates.template_json` | scalar in jsonb | `mdata.customers` | `z.record(z.string(), z.unknown())` — arbitrary jsonb accepted |
| C13-15 | `safety.company_violations.evidence_doc_ids` | `uuid[]` | `docs.files` | **dead column** — no writer, no reader |
| C13-23 | `safety.incidents.evidence_uuids` | `uuid[]` | `documents.damage_photo_evidence` | duplicates an FK that already points the right way, **plus an active bug** (below) |
| C13-28 | `usmca_ops.activation_state.pilot_driver_ids` | `uuid[]` | `mdata.drivers` | **dead, and pre-launch** — USMCA goes live July 2026 |
| C13-31 | `tasks.task_activity.payload` | scalar + ARRAY | `tasks.task_comments`, `identity.users` | duplicates C13-30 into a second unenforced store |

**Tier 1.5 — C13-06** (`accounting.recurring_bill_templates.line_items` → `catalogs.accounts`): has a
uuid *format* check but **no existence check**, and it is financial. Treat as tier 1.

---

## FULL INVENTORY

### C13-01 — `catalogs.maintenance_vendors.metadata` → `mdata.vendors`  *(SEED 1 — owner-supplied, verified)*
- **shape** scalar id in jsonb · **key path** `metadata->>'mdata_vendor_id'`
- **writer** `apps/backend/src/maintenance/vendors.routes.ts:101` (in `buildVendorMetadata`, declared `:82`)
- **reader** `apps/backend/src/maintenance/vendors.routes.ts:120` (`mapVendorRow`), also `:209`
- **integrity** app-level existence check only — `assertMdataVendorExists` `:178-190`, called `:324` (POST), `:368` (PATCH); entity-scoped and `deactivated_at IS NULL`-filtered `:184`
- **junction/FK table?** **no.** Table created by the generic loop with only `metadata jsonb` — `db/migrations/0066_p3_t11_21_5a_maintenance_catalogs.sql:16` (name), `:20-34` (body). No `mdata_vendor_id` column exists to FK.
- **notes** Check is **create/update-time only** — nothing re-validates after the vendor is deactivated or moves entity. Guard `scripts/verify-maint-wo-vendor-linkage.mjs:26-36` currently pins this shape in place.

### C13-02 — `safety.company_violations.related_drivers` / `.related_units` / `.related_fine_ids` → `mdata.drivers`, `mdata.units`, `safety.civil_fines`  *(SEED 2 — verified; SAF-B28)*
- **shape** id ARRAY in jsonb (3 columns) · declared `db/migrations/0050_safety_gaps_fill.sql:62-64`
- **writer** `apps/backend/src/safety/company-violations.routes.ts:258`, `:265` — the **PATCH** still `JSON.stringify`s these and emits `SET related_drivers = $n::jsonb`
- **reader** GET-list `:118-122` reads the **junction tables**; GET-by-id `:146-148` is a bare `SELECT *` and returns the stale jsonb
- **integrity** **NOTHING.** PATCH body schema is `z.unknown().optional()` (`:50-52`) — not even a uuid format check
- **junction/FK table?** **YES, and writer/reader DISAGREE.** `safety.company_violation_drivers` / `_units` / `_fines`, `db/migrations/202607820000_safety_relational_linkage_and_lifecycle.sql:60-101`, real FKs `:64`, `:78`, `:96`. **Migration recorded as applied on prod** (`db/migrations/.held-migrations.json`, `applied_held`, `"applied_on_prod": true`, GUARD live cross-check 2026-07-25).
- **notes** POST writes junctions (`:198-215`), GET-list reads junctions (`:118-122`), PATCH writes the retired jsonb. **An operator's edit is a silent no-op against every list view.** The migration declared these columns RETIRED via `COMMENT ON COLUMN` (`202607820000…:207-213`, "no code writes or reads it") — **that comment is now false**, which is itself a §9 drift worth flagging. **Belongs to another lane (Cursor / C2). RECORDED, NOT FIXED.**

### C13-03 — `catalogs.expense_categories.metadata` → `catalogs.accounts`  **[FINANCIAL · worst hit]**
- **shape** scalar id in jsonb · **key path** `metadata->>'account_id'`, fallbacks `->>'account_uuid'`, `->>'coa_account_id'`
- **writer** `apps/backend/src/catalogs/fuel/factory.ts:180` (INSERT), `:236` (PATCH); wired for this catalog at `apps/backend/src/catalogs/accounting/index.ts:285-290`. Body schema `factory.ts:31` = `z.record(z.string(), z.unknown())` — **arbitrary keys, zero validation**
- **reader** `apps/backend/src/accounting/posting-engine.service.ts:686-700` (`resolveBillCategoryAccount` — **the account a bill line posts to**); `apps/backend/src/accounting/expense-category-catalog.ts:23`, `:100`; `apps/backend/src/qbo-sync/qbo-purchases-puller.ts:457-459`
- **integrity** **NOTHING**
- **junction/FK table?** **no.** Created by the 0152 generic loop with only `metadata jsonb` — `db/migrations/0152_p6_t11187_lists_hub_accounting_catalog_completion.sql:9` (name), `:11-24` (body)
- **notes** The **correct sibling pattern is one file over**: `catalogs.account_role_bindings` keeps a **real `account_id` column** and only *projects* it into a metadata shape at read time (`catalogs/accounting/index.ts:270`). Same for `accounts`/`items`/`classes` (`index.ts:40-56`, `:173-202`). `expense_categories` is the one that never got converted. `expense-category-catalog.ts:83-86` claims every prod row's metadata is currently `{}` — **that is a code comment, UNVERIFIED against prod.**

### C13-04 — `safety.integrity_alerts.related_load_ids` / `_wo_ids` / `_safety_event_ids`
- **shape** id ARRAY in jsonb (3 columns) · declared `db/migrations/0050_safety_gaps_fill.sql:105-107`
- **target** `mdata.loads`, `maintenance.work_orders`, safety events — **UNVERIFIED**: no code resolves these ids, so the intended target cannot be confirmed from source
- **writer** `apps/backend/src/safety/integrity-alerts.routes.ts:439`, `:456-458` · **reader** `:119`, `:267` (`SELECT *`, passed to the client raw; nothing joins)
- **integrity** **NOTHING** — body schema `z.unknown().optional()` `:46-48`
- **junction/FK table?** no
- **notes** Same table uses **real FK columns** for its scalar subjects (`subject_driver_id`/`subject_unit_id`/`subject_vendor_id`, `0050…:94-96`), so the arrays are the sole unenforced path. Sibling of C13-02, same migration, **not** covered by the 202607820000 junction fix.

### C13-05 — `safety.drug_pool_selections.selected_driver_ids` → `mdata.drivers`
- **shape** id ARRAY in jsonb · declared `db/migrations/0257_safety_drug_pool.sql:10`
- **writer** `apps/backend/src/safety/drug-pool.routes.ts:85-103` · **reader** **none found** — write-only column
- **integrity** **NOTHING** as a constraint; ids are server-derived from a live roster (`:69-78`, `deactivated_at IS NULL`), so correct at write time and free to rot after
- **junction/FK table?** no
- **notes** FMCSA random-selection evidence with **no reverse query** (a driver cannot ask "was I ever selected?").

### C13-06 — `accounting.recurring_bill_templates.line_items` → `catalogs.accounts`  **[FINANCIAL]**
- **shape** id ARRAY in jsonb (array of objects) · **key path** `line_items[].coa_account_id` · declared `db/migrations/202606072351_recurring_bills.sql:21`
- **writer** `apps/backend/src/accounting/bills/recurring/template.service.ts:56`, `:77`; update `:102`, `:108`; route schema `…/recurring/routes.ts:30-39`
- **reader** `apps/backend/src/accounting/bills/recurring/generator.service.ts:56-73` — maps each element into a real `accounting.bill_lines` row (`accountId: line.coa_account_id`, `:68`)
- **integrity** **format only, no existence check.** `routes.ts:35` = `z.string().uuid().optional().nullable()`; `generator.service.ts:64-66` throws only on a **missing** id. Nothing verifies the account exists, is postable, or belongs to the entity
- **junction/FK table?** **no** — there is no `recurring_bill_template_lines` table
- **notes** A stale/foreign/deleted account id surfaces only when the cron materializes a bill. Pattern break: the *generated* row lands in a real table with real columns; only the **template** keeps ids in jsonb.

### C13-07 — `accounting.recurring_templates.template_payload` → `mdata.customers`, `mdata.vendors`, `catalogs.accounts`  **[FINANCIAL]**
- **shape** scalar ids in jsonb **plus** an id ARRAY · **key paths** `->>'customer_id'`, `->>'vendor_id'`, `->>'payment_account_uuid'`, `->'postings'[].account_id` · declared `db/migrations/0185_p7_w2_recurring_templates.sql:14`
- **writer** **none found in the repo** — only readers/updaters (`recurring.worker.ts:389`, `:432`, `:460`; `admin/sync-health.routes.ts:125`) and the cron (`cron/recurring-templates.cron.ts:11`). No INSERT surface exists. **UNVERIFIED whether prod has rows.**
- **reader** `apps/backend/src/accounting/recurring.worker.ts:46-48` (invoice), `:165-169` (bill), `:224-232` + `:289` (journal), `:330-350` (expense)
- **integrity** **mixed and inconsistent** — `customer_id`: app-level existence check `:50-67`; `vendor_id`: **presence check only** `:169`; `postings[].account_id`: **NOTHING** — `:230-238` validates only that debits equal credits, then inserts `String(p.account_id)` straight into `accounting.journal_entry_postings.account_id` at `:289`
- **junction/FK table?** no
- **notes** A cron that materializes **journal entries** from jsonb account ids with zero existence checking is the most consequential unenforced path after C13-03.

### C13-08 — `accounting.recon_exceptions.source_ref` → polymorphic  **[FINANCIAL]**
- **shape** scalar id in jsonb, polymorphic `{kind, id, display}` · **key path** `source_ref->>'id'` discriminated by `->>'kind'` · declared `db/migrations/202607022100_recon_runs_exceptions.sql:56`
- **target** `banking.bank_transactions` | `accounting.bills` | `driver_finance.driver_settlements` | `accounting.journal_entries` | `mdata.loads` (enumerated at `apps/backend/src/accounting/recon/recon-engine.service.ts:43`)
- **writer** `recon-engine.service.ts:128-131`; constructed `:64`, `:72`, `:90`, `:97`, `:205` · **reader** `apps/backend/src/accounting/qbo-recon-reads.ts:199`; **nothing resolves the id back to its source row**
- **integrity** **NOTHING** — and the writer deliberately emits **non-uuid sentinels**: `source_ref: { kind: "bank_txn", id: "window", … }` at `:64` and `:72`. The column provably holds values that are not row ids at all
- **junction/FK table?** no
- **notes** Polymorphic, so a single FK is impossible. Correct remedy = five nullable per-kind FK columns + a CHECK that exactly one is set — the shape `safety.integrity_alerts` already uses for its subjects. Sibling `qbo_ref` (`:57`) is an external-system id and is **out of C13 scope**.

### C13-09 — `mdata.loads.quicksave_pending_fields` → `dispatch.detention_events`, `mdata.loads`  **[money-carrying]**
- **shape** id ARRAY in jsonb · **key path** `->'accessorial_bridge_rows'[].detention_event_id`, `[].load_id` · declared `db/migrations/0100_p5_f3_quicksave_assignments.sql:6`
- **writer** `apps/backend/src/dispatch/detention.service.ts:252-262` — **the same UPDATE also does `rate_total_cents = COALESCE(rate_total_cents,0) + $2`**, i.e. it moves customer revenue in the same statement. Bridge object built `:239-244`
- **reader** `detention.service.ts:246-250` only (reads its own prior rows to append). **No other consumer exists.**
- **integrity** **NOTHING**
- **junction/FK table?** **no** — the mirror-image copy on the other side, `dispatch.detention_events.billing_bridge_accessorial` (`db/migrations/0353_dispatch_detention_events.sql:22`), is **also jsonb**. The link is jsonb on both ends.
- **notes** ⚠ **A CI guard currently pins this defect in place:** `scripts/verify-dispatch-detention-board.mjs:57` FAILS if the string `accessorial_bridge_rows` disappears from the service. **Update it, never delete or weaken it.** (Separately: the same jsonb carries load-level `hazmat` — a boolean, not an id, so **not** a C13 hit.)

### C13-10 — `dispatch.load_templates.template_json` → `mdata.customers`
- **shape** scalar id in jsonb · **key path** `->>'customer_id'` · declared `db/migrations/0159_p6_t11191_dispatch_refinements.sql:25`
- **writer** `apps/backend/src/dispatch/dispatch-refinements.service.ts:473-475`; route schema `dispatch-refinements.routes.ts:70` = `z.record(z.string(), z.unknown())`; frontend origin `apps/frontend/src/pages/dispatch/LoadTemplateLibrary.tsx:288`
- **reader** `LoadTemplateLibrary.tsx:171` (`setValue("customer_id", json.customer_id)`), invoked from `pages/dispatch/components/BookLoadModalV4.tsx:356`, `:1025-1027`
- **integrity** **NOTHING** · **junction/FK table?** no
- **notes** Failure mode is a UI one: applying a template for an archived customer silently prefills a dead `customer_id` into Book Load.

### C13-11 — `safety.da_random_pool_draws.drawn_test_kinds` → `mdata.drivers`  *(ids as jsonb object KEYS)*
- **shape** id ARRAY in jsonb — driver uuids used as **object keys**: `{ "<driver_uuid>": "drug"|"alcohol" }` · declared `db/migrations/0327_drug_alcohol_program.sql:63`
- **writer** `apps/backend/src/safety/drug-alcohol/random-pool.service.ts:197-226` (built `:188-191`) · **reader** `:235-237`, `:257`
- **integrity** **NOTHING** — server-derived, correct at write time only
- **junction/FK table?** **partially** — `scheduleTest` (`:234`) writes one `safety.da_test_records` row per drawn driver, but `safety.da_test_records.driver_uuid` (`0327…:31`) **also has no FK**, so the "proper" path is unenforced too
- **notes** The whole 0327 table family lacks FKs on `operating_company_id`, `driver_uuid`, and `sap_referral_uuid`.

### C13-12 / C13-13 / C13-14 — the three `document_ids uuid[]` event tables → `docs.files`
| holder | migration | writer | reader | patch |
|---|---|---|---|---|
| `mdata.driver_safety_events.document_ids` | `db/migrations/0023_driver_safety_file.sql:67` | `apps/backend/src/mdata/driver-safety-events.routes.ts:588`, `:608` | `:495` | `:734-736` |
| `mdata.dispatcher_safety_events.document_ids` | `db/migrations/0025_dispatcher_safety_file.sql:115` | `apps/backend/src/mdata/dispatcher-safety-events.routes.ts:428`, `:449` | `:345` | `:571-573` |
| `mdata.customer_quality_events.document_ids` | `db/migrations/0026_customer_quality_flags.sql:133` | `apps/backend/src/mdata/customer-quality-events.routes.ts:256`, `:276` | `:187` | `:405-407` |
- **shape** `uuid[]` · **integrity** **format only** (`z.array(uuidSchema).max(100)` — `:61`/`:76`, `:117`/`:132`, `:55`/`:70`). No existence check, no entity check, no trigger
- **junction/FK table?** **YES — `docs.file_links`**, `db/migrations/0028_docs_schema.sql:114-127`, `file_id UUID NOT NULL REFERENCES docs.files(id) ON DELETE RESTRICT` at `:116`. Writer and reader do **not** disagree (both use the array), so **not** the SAF-B28 shape *yet* — but it is a second, parallel, unenforced attachment path that bypasses the sanctioned one
- **notes** All three tables **do** use real FKs for their catalog links (`termination_reason_id` `0023…:65`; `error_reason_id` `0025…:106`; `reason_id` `0026…:127`) — the pattern was understood and the document link was the exception.

### C13-15 — `safety.company_violations.evidence_doc_ids` → `docs.files`  *(DEAD)*
- **shape** `uuid[]` · **writer/reader** **none** — no `apps/` reference at all · **integrity** **NOTHING**
- **junction/FK table?** yes, `docs.file_links`. The same table carries two properly-FK'd doc columns: `source_doc_id`, `audit_export_doc_id`, both `REFERENCES docs.files(id)` at `db/migrations/0050_safety_gaps_fill.sql:65-66`
- **notes** Added post-hoc in three places — `db/migrations/0050_two_section_v5_and_safety_restructure.sql:286`, and re-added as prod-drift repair at `db/migrations/202606241800_reconcile_prod_catalog_schema_drift.sql:90`. **That migration's header (`:12`) records a prod check** — one of "2 MISSING columns on safety.company_violations".

### C13-16 — `safety.complaints.evidence_doc_ids` → `docs.files`
- **shape** `uuid[]` · **writer** two divergent writers: `apps/backend/src/safety/safety-v5.routes.ts:545`, `:555` and `apps/backend/src/routes/safety/complaints.ts:171`, `:192` · **reader** via `RETURNING *`
- **integrity** **format only** (`complaints.ts:45`) · **junction/FK table?** yes, `docs.file_links`
- **notes** ⚠ **Separate §9 drift worth escalating on its own:** declared three times with **conflicting surrounding table shapes** — `0050_two_section_v5_and_safety_restructure.sql:330` (`complainant_id`/`respondent_id`/`complaint_type_id`) vs `0051_p3_t11_17_2_safety_v6_4_schema.sql:149` (`complainant_driver_id`/`complainant_user_id`/`complaint_type` text). Two backend routes write the two different shapes to the same table name.

### C13-17 — `compliance.form_425c_reports.attachment_38…42_*_uuids` (**5 columns**) → `docs.files`
- **shape** `uuid[]` ×5: `attachment_38_bank_statements_uuids`, `_39_recon_reports_`, `_40_financial_reports_`, `_41_budget_`, `_42_job_costing_` · declared `db/migrations/0053_p3_t11_13_form_425c.sql:37-41` (re-declared `db/migrations/0123_p6_pre_ledger_drift_reconciliation.sql:868-872`)
- **writer** per-line attach `apps/backend/src/compliance/form-425c.routes.ts:1147-1161`; **bulk clone** `:967-971`, `:1012-1016` · **reader** `:1126-1132`
- **integrity** **app-level existence check on ONE of two write paths** — `:1136-1146` (`SELECT id FROM docs.files WHERE id=$1 AND operating_company_id=$2`, throws `file_not_found`). **The bulk clone path copies the arrays wholesale with no check.**
- **junction/FK table?** yes, `docs.file_links`
- **notes** Court-filing evidence (**Ch.11 Form 425C**) — a dangling attachment id is an audit/legal exposure, not a UI gap.

### C13-18 — `factoring.batch.invoice_ids` → `accounting.invoices`  **[FINANCIAL]**
- **shape** `uuid[]` · declared `db/migrations/0286_factoring_batch.sql:11`
- **writer** `apps/backend/src/factoring/batch.service.ts:189-208` · **reader** `:132-135` (`i.id = ANY(b.invoice_ids)`), `reserve.service.ts:150`, `bank-match.service.ts:87`, `submission-queue.service.ts:95`
- **integrity** **app-level existence check, create-time only** — eligibility query `:118-137` + `missingIds` throw `:141-144` (`invoice_not_eligible`); route cap `z.array(z.string().uuid()).min(1).max(500)` at `accounting/factoring-advances.routes.ts:35`
- **junction/FK table?** **no** — no `factoring.batch_invoices` exists
- **notes** This array **is the pledge record** — which receivables were assigned to Faro. A dangling member is an unprovable assignment against a secured borrowing. Also: `factoring.batch.factor_id` (`0286…:20`) is a bare uuid with **no** `REFERENCES` — different class, belongs in a bare-uuid sweep.

### C13-19 — `compliance.notification_rules.recipient_user_ids` → `identity.users`
- **shape** `uuid[]` · declared `db/migrations/0304_compliance_dashboard.sql:11`
- **writer** `apps/backend/src/compliance/compliance-notification-rules.routes.ts:68-78`, `:113`, `:127` · **reader** `:44`, `:71`; consumed `compliance-reminder.job.ts:20-28`, `:58`
- **integrity** **format only** (`:12`) · **junction/FK table?** no
- **notes** Failure mode is a **missed compliance reminder**: a deactivated user's id stays in the array and the notification goes nowhere, silently.

### C13-20 — `safety.da_random_pool_draws.drawn_driver_uuids` → `mdata.drivers`
- **shape** `uuid[]` · declared `db/migrations/0327_drug_alcohol_program.sql:62`
- **writer** `apps/backend/src/safety/drug-alcohol/random-pool.service.ts:197-226` · **reader** `:214`, `:234`, `:257`; UI `apps/frontend/src/pages/safety/drug-alcohol/RandomPoolDashboard.tsx:18`
- **integrity** **NOTHING** — server-derived, correct at write time only · **junction/FK table?** partially (see C13-11)
- **notes** The service comment at `:166` states these are stored verbatim as the FMCSA audit record — an unresolvable member is an audit-evidence failure.

### C13-21 — `driver_finance.driver_settlement_disputes.evidence_doc_ids` → `docs.files`
- **shape** `uuid[]` · declared `db/migrations/202607640000_settlement_disputes_convergence_columns.sql:20`
- **writer** `apps/backend/src/settlements/disputes/disputes.routes.ts:171-190` (col `:179`, value `:187`) · **reader** `:132`
- **integrity** **format only** (`:32`) · **junction/FK table?** yes, `docs.file_links`
- **notes** **That migration's header (`:1-14`) records a prod check** — all three dispute tables at 0 rows as of 2026-07-21 (their claim; not re-verified this session).

### C13-22 — `settlements.settlement_disputes.evidence_doc_ids` → `docs.files`  *(RETIRE table)*
- **shape** `uuid[]`, `db/migrations/0393_settlement_disputes.sql:15` · **writer/reader** **none**
- **notes** `apps/backend/src/settlements/disputes/disputes.routes.ts:11` names it as the RETIRE table the routes moved off. **Close as retired — do not remediate.** (§10(b): driver settlement is `driver_finance.*`.)

### C13-23 — `safety.incidents.evidence_uuids` → `documents.damage_photo_evidence`
- **shape** `uuid[]` · declared `db/migrations/202606071630_damage_photo_exif_chain.sql:37`
- **writer** `apps/backend/src/safety/damage-reports/photo-evidence.service.ts:82-91` and `apps/backend/src/safety/incidents/full-report.service.ts:140-141` · **reader** none that resolves it; dynamic target at `apps/backend/src/dispatch/intransit-issues.routes.ts:148`
- **integrity** **NOTHING**
- **junction/FK table?** **YES, already correct in reverse** — `documents.damage_photo_evidence.damage_incident_id uuid NOT NULL REFERENCES safety.incidents(id) ON DELETE CASCADE`, `db/migrations/202606071630_damage_photo_exif_chain.sql:7`. The array is a **pure duplicate** of an FK that already exists
- **notes** ⚠ **Material bug found in passing (raise separately from C13):** `full-report.service.ts:140-141` populates `evidence_uuids` with `input.photo_keys.filter(isUuid)` — that is the **R2 object-key list**, not evidence-row ids. Any photo key that happens to parse as a uuid is written into a column whose declared meaning is `documents.damage_photo_evidence.id`, fabricating a link to a row that will never exist.
- **remedy** delete the array + use the reverse query. Not a new table.

### C13-24 / C13-25 — `safety.photo_comparison_sessions.pre_trip_evidence_uuids` / `.post_trip_evidence_uuids` → `documents.damage_photo_evidence`
- **shape** `uuid[]` ×2 · declared `db/migrations/202606071830_pre_post_trip_photo_sessions.sql:14`, `:16`
- **writer** `apps/backend/src/safety/photo-comparison/session.service.ts:258-279` (pre), `:294-307` (post) · **reader** `:334`, `:339`; `diff-engine.service.ts:114`
- **integrity** **format + non-empty only** — `photo-comparison/routes.ts:43`, `:48`; `session.service.ts:255-257`, `:291-293` throw `evidence_uuids_required`. No existence check
- **junction/FK table?** **no** for the evidence link — though the same table correctly FKs its incident link (`auto_damage_report_uuid uuid REFERENCES safety.incidents(id)`, `:23`), while `load_uuid`, `driver_uuid`, `unit_uuid` (`:10-12`) are bare uuids with no FK

### C13-26 — `integrations.active_driver_set_cache.active_driver_uuids` → `mdata.drivers`  *(lowest severity)*
- **shape** `uuid[]` · declared `db/migrations/202606080001_active_driver_set_cache.sql:20`
- **writer** `apps/backend/src/integrations/samsara/active-driver-set/recompute.service.ts:80-93` · **reader** `query.service.ts:45`, `:60`, `:71`
- **integrity** **NOTHING** — derived from a live join, correct at snapshot time
- **RECOMMENDATION** classify as **accepted-by-design, not remediated**. It is an explicitly named *cache* with a pruning DELETE (`recompute.service.ts:98-108`) and a snapshot timestamp; a point-in-time snapshot is legitimately allowed to name rows that later change.

### C13-27 — `reports.scheduled_subscriptions.recipient_user_uuids` → `identity.users`
- **shape** `uuid[]` · declared `db/migrations/202606080206_scheduled_report_subscriptions.sql:16`
- **writer** `apps/backend/src/reports/scheduled/subscription.service.ts:104-127` · **reader** `:58-60`
- **integrity** **format only** (`reports/scheduled/routes.ts:23`) · **junction/FK table?** no

### C13-28 — `usmca_ops.activation_state.pilot_driver_ids` → `mdata.drivers`  *(DEAD · pre-launch)*
- **shape** `uuid[]` · declared `db/migrations/202606080244_usmca_ops_schema_grant.sql:17`
- **writer/reader** **none** in `apps/`. Repo-wide hits are baselines only (`scripts/verify-no-dead-schema.baseline.json:2978`, `docs/schema-parity-baseline.json:10115`, `docs/schema/SCHEMA-MANIFEST.json:75929`) plus a duplicate DDL copy at `apps/backend/src/migrations/202606080244-usmca-activation-state.sql:16`
- **integrity** **NOTHING** · **junction/FK table?** no
- **notes** Already on the dead-schema baseline. **Matters because USMCA launches July 2026** — give it a real junction table **before first use** rather than remediating after.

### C13-29 — `maintenance.road_service_tickets.attached_doc_ids` → `docs.files`
- **shape** `uuid[]` · declared `db/migrations/202606281020_road_service_tickets.sql:29`
- **writer** `apps/backend/src/maintenance/road-service/tickets.routes.ts:127-166` (col `:134`, value `:166`) · **reader** `:102`
- **integrity** **format only** (`:31`) · **junction/FK table?** yes, `docs.file_links`
- **notes** Road-service tickets feed WO creation (`road-service/wo-integration.ts:77`), and per **G18** every roadside expense must FK to a load — the evidence trail behind that expense should be enforced too.

### C13-30 — `tasks.task_comments.mentions` → `identity.users`
- **shape** `uuid[]` · declared `db/migrations/202606300120_tasks_team_chat.sql:25`
- **writer** `apps/backend/src/tasks/task.routes.ts:528-531` · **reader** `:499`; rendered `apps/frontend/src/pages/tasks/TasksChatPage.tsx:241`
- **integrity** **format only** (`task.routes.ts:121`) · **junction/FK table?** no
- **notes** Same table **does** FK `task_id → tasks.task(task_id)` (`:23`), while `author_user_id` (`:25`) is a bare uuid with no FK.

### C13-31 — `tasks.task_activity.payload` → `tasks.task_comments`, `identity.users`
- **shape** scalar id in jsonb **+** id ARRAY · **key paths** `payload->>'comment_id'`, `payload->'mentions'` · declared `db/migrations/202606300120_tasks_team_chat.sql:42`
- **writer** `apps/backend/src/tasks/task.routes.ts:537-540`; siblings `:271`, `:435` · **reader** none that extracts these keys
- **integrity** **NOTHING** · **junction/FK table?** no
- **notes** Duplicates C13-30 into a second unenforced store. **Distinguish from `audit.audit_events.payload` / `events.event_log.payload`**, which are deliberately immutable denormalized snapshots and are **out of C13 scope by design** (§2 append-only).

---

## THREE CROSS-CUTTING OBSERVATIONS FOR THE REMEDIATION LANE

1. **`docs.file_links` already exists and is FK-enforced** (`db/migrations/0028_docs_schema.sql:114-127`).
   **8 of the 39 columns** are parallel document-attachment arrays that bypass it — C13-12, -13, -14,
   -15, -16, -17 (×5), -21, -22, -29. **One decision** ("all document attachments go through
   `docs.file_links`") closes the largest single cluster. Caveat: `docs.file_links.entity_id` itself
   has **no** FK by design (polymorphic), documented at `0028_docs_schema.sql:129` — a different class.

2. **C13-23 needs deletion, not a new table.** `safety.incidents.evidence_uuids` duplicates an FK that
   already points the right way (`documents.damage_photo_evidence.damage_incident_id`). Remedy is
   removing the array and using the reverse query.

3. ⚠ **Two CI guards currently PIN C13 defects in place** and will go red on the correct fix:
   - `scripts/verify-dispatch-detention-board.mjs:57` — requires the `accessorial_bridge_rows` jsonb string (C13-09)
   - `scripts/verify-maint-wo-vendor-linkage.mjs:26-36` — requires the metadata-jsonb `mdata_vendor_id` app-check shape (C13-01)

   Per the recorded "guards that assert the defect" pattern: **update them, never weaken or delete them.**

---

## DELIBERATELY EXCLUDED — checked, not hits

- **R2 object keys / file paths** — `photo_keys`, `r2_photo_paths`, `evidence_r2_paths`, `photo_r2_paths` (not table rows)
- **External-system ids** — `metadata.qbo_*`, `qbo_ref`, QBO-mirror `payload_json`, `plaid_category`
- **Code / label / role arrays** — `applies_to`, `part_location_codes`, `applies_to_unit_class`, `recipient_roles`, `notify_roles`, `csa_basic_categories`, `conflict_fields`, `default_link_kinds`, `supported_transactions`; email-address arrays
- **Label/amount objects (verified, no ids)** — `mdata.customer_lanes.accessorials`, `ifta.state_gallons_by_quarter.source_records`
- **Intentional immutable snapshots (§2 append-only)** — `audit.audit_events.payload`, `events.event_log.payload`, `audit.row_changes`
- **Bare `uuid` columns with no `REFERENCES`** — e.g. `factoring.batch.factor_id`, `safety.da_test_records.driver_uuid`, `safety.photo_comparison_sessions.driver_uuid`, `safety.dot_inspections.pdf_evidence_id` / `spawned_wo_id`. **A different defect class** (a scalar column that *could* take an FK and doesn't). Several are already tracked by `scripts/verify-picker-law-no-raw-uuid.mjs` — see the C1 no-enforced-FK ratchet.

---

## RELATIONSHIP TO C1's OWN no-enforced-FK RATCHET

C1 (`scripts/verify-picker-law-no-raw-uuid.mjs`) carries a small, self-invalidating list of **three**
bare-uuid columns it refused to put a picker over. Those are the **bare-uuid** class, not C13:

| column | migration |
|---|---|
| `mdata.unit_border_crossings.load_id` | `db/migrations/0295_vehicle_profile_part1.sql:105` |
| `mdata.unit_border_crossings.driver_id` | `db/migrations/0295_vehicle_profile_part1.sql:104` |
| `dispatch.equipment_transfer_requests.equipment_uuid` | `db/migrations/202606080204_equipment_transfer_requests.sql:7` |

They are listed here only so the two inventories do not double-count. **C13 is the jsonb/array class.**

---

## BOUNDARY

This is an inventory. **No FK was added, no migration authored, no writer repointed, no guard changed.**
Any schema change arising from this file is HELD and is the owner's to apply on Neon. Rows marked
another lane's (notably C13-02 / SAF-B28) are recorded here and remain that lane's to fix.
