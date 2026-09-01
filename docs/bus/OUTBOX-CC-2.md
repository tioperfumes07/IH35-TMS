# ★ OUTBOX-CC-2 · 2026-09-01T06:50Z

FORCE NOW | READ FEED/NOW-CC-2 + INBOX-CC-2 | NOW=verify GO-01 TIV exactly $1,077,940.00 | API=7496ccf | GO

---

## ★ CLOSED · 2026-09-01T08:56Z · CC-2

NO-SEAT+WIR-02 Recipe C push: DONE, merged #19103 (`77f9eb549a`). Same batch: #19105
(`d548cb010d`), #19111 (`ace28a6cf3`). Backend deployed live post-merge, healthz confirmed.
See INBOX-CC-2.md DONE entry for full evidence. No open PRs; idle, watching for next queue
item.

---

## ★ CLOSED · 2026-09-01T12:20Z · CC-2 · GUARD verify #19175-#19219 complete

Per owner INBOX-CC-2 TOP: "GUARD verify #19175-#19219 NOW. OUTBOX grade."

- **GUARD verify #19175-#19219**: 57-script guard-suite sweep of post-batch tree + targeted
  deep-dives (void cascade, sort-columns). Classified all 45 merged PRs in range (11
  bus-only, 13 guard/housekeeping, 18 mechanical product). PASS 17 of 18 mechanical PRs; 1
  real regression found and filed OPEN (GLOBAL-SORT-RULE A1, 6 missing `sortable:` columns,
  precisely attributed by file). 2 guard-infrastructure false positives found and fixed. Full
  accounting: `GUARD-BATCH-19175-19219-ACCOUNTING` row on `docs/audit/GUARD-WORKORDERS.md`,
  merged #19243 (`4c0e72170f`).
- **OUTBOX grade**: `docs/bus/OUTBOX-CURSOR.md` #19175 DISP-VOID-CASCADE-01 claim graded
  accurate (code covers all 3 axes as claimed; live-verified the invoice axis via Neon +
  CC-1's own proof; driver-bill/settlement axes UNEXERCISED not disproven). Reply posted,
  merged #19234 (`9cff8f6a58`).
- **Urgent side-fix shipped mid-task**: `verify-docs-upload-viewed-entity.mjs` false-positive
  (blocked every PR's `build-typecheck-heavy`) — merged #19237 (`10ddcceed4`).
- **Self-grade + typecheck-RED cleanup** (from prior loop, closed out this pass): merged
  #19227 pending final CI settle (locked-guards/pass-7 fails are confirmed pre-existing,
  unrelated — `MAIN-ACCOUNTING-SUBNAV-GROUPED-DROPDOWN-BREAK` +
  `WO-WIZARD-VENDOR-1099-FIELDS-REGRESSION`, both already filed OPEN for CC-3/CC-1).

No open verify-task items remain from this INBOX instruction. Idle, watching for next queue
item.

---

## ★ CLOSED · 2026-09-01T13:40Z · CC-2 · GUARD grade: Safety Internal Fines + Dispatch column law

Per owner chat instruction: "GUARD Safety Internal Fines + Dispatch column law after Cursor
ships. Grade live."

- **Safety Internal Fines (#19230)**: PASS, live-verified on `app.ih35dispatch.com` — driver
  and Fine# both open the detail drawer, QBO `$` formatting, flat layout, conditional load/
  settlement/liability EntityLinks all confirmed working. One attributable addendum filed (not
  fixed, GUARD lane is verify-only): the PR's 2 new columns (Load, Settlement) ship without
  `sortable:`, adding to the still-open GLOBAL-SORT-RULE batch finding.
- **Dispatch column law**: `COL-02/COL-03` (#19236) confirmed live + guard-PASS.
  `DSP-05-ASSIGNMENT-PARITY-LOCATION` (#19253) + `SWEEP-A-PARITYTABLE-HEADER-HIT-TARGET`
  (#19258) confirmed **code-correct and guard-PASS but not yet deployed** — root-caused via
  the `/system` Software/Build page's own "DEPLOY MISMATCH" flag + `git merge-base
  --is-ancestor` checks against the deployed frontend build (`0642d75`, which predates both
  PRs). Same recurring FE-deploy-lag pattern DEVIN-A already flagged twice this session — not
  a code defect, re-verify owed once the frontend deploy catches up.

Full evidence: `GUARD-SAF-FINES-DSP-COLUMN-LAW-GRADE` row on `docs/audit/GUARD-WORKORDERS.md`,
merged #19263. No open verify-task items remain. Idle, watching for next queue item.

---

## ★ PARTIAL · 2026-09-01T14:15Z FROZEN PASTE · CC-2 · GO-10/GO-01/GO-08 verify

Could not read `~/Desktop/IH35-SEAT-FEED/CC-2/` — EPERM (no filesystem access to that path
from this session, both shell and file-read tools). Worked from the inline paste spec instead;
flagging so a future session with Desktop access can diff against the canonical files.

**A–E (GO-10, load-number concurrency): NOT RUN — GO-10 has not merged.** Live code check,
`origin/main` HEAD at read time: `apps/backend/src/dispatch/load-id-reservation.service.ts`
still has `MAX_LOAD_ID_RESERVE_ATTEMPTS = 8` (line 35) and the `[0-9]{4}` trailing-digit regex
(lines 44, 54) — item E's own "confirm gone" check fails because the old code is still there.
`first_load_number_required` has **zero** matches anywhere in the repo — the 422 path item D
expects doesn't exist yet. No `requestedLoadNumber`/typed-number field on `ReserveInput` either
— the current file only implements auto-sequence reservation (recompute-and-retry on 23505,
bounded to 8 attempts), not a typed-number path at all. Did **not** hit the live API to test A–C
myself — booking a load in prod is owner-only per this same GO's own Cursor packet ("NO-SEAT: do
not book 13560 in prod yourself. Owner keys loads."), and GO-10 isn't live to test against
regardless. Will re-run A–E once CC-1's GO-10 merges and deploys.

**GO-01 TIV: progressed, not yet exact.** Live Neon, `tiny-field-89581227`, `SET LOCAL
app.bypass_rls='lucia'`:
```sql
SELECT count(*), sum(insured_value_cents)/100.0
FROM insurance.policy_unit pu JOIN insurance.policy p ON p.id=pu.policy_id
WHERE p.policy_number='437539' AND pu.removed_at IS NULL;
-- count=34, sum=$1,040,540.00  (target: 35 units, $1,077,940.00 exactly)
```
Breakdown by asset_type on the policy: flatbed 10 / $178,995.00, reefer 10 / $164,500.00 —
20 trailers, $343,495.00 total, **matches the doc's trailer target exactly**. Tractors: only
**14** attached (target 15), summing $697,045.00 vs the doc's own $734,445 target for 15 —
**exactly $37,400.00 short, one tractor missing.** `mdata.assets` for USMCA: tractor=49 (✓
matches your target), reefer=10 + flatbed=10 (✓ =20, your "trailer 20"). `insurance.driver_schedule`
count = **13** (✓ exact match, Defect 5 done). So: assets + driver_schedule are correct; the gap
is one specific tractor not yet attached to 437539. I don't have the signed Lloyd's schedule to
name which unit — routing the $37,400/1-tractor gap to CC-1 (has the source table) rather than
guessing an id.

**GO-08: 72 ON CONFLICT DO UPDATE confirmed** (`grep -rEn "ON CONFLICT[^;]*DO UPDATE"
apps/backend/src --include="*.ts"` — re-run against this session's `origin/main` tip, still 72).
41 unique production files, 28 test-fixture occurrences, 1 false match (a comment string in
`middleware/idempotency.ts`). Table / conflict target / owner-data risk for every production
clause:

| Table | Conflict target | Risk |
|---|---|---|
| driver_finance.driver_settlement_gl_bills (×2) | (operating_company_id, driver_bill_id) | **money** — settlement GL posting |
| driver_finance.escrow_balances (×2, two callers) | (operating_company_id, driver_id) | **money** — driver escrow |
| accounting.property_tax_accruals | (operating_company_id, rendition_id) WHERE is_active | **money** — tax accrual |
| accounting.ob_source_finality | (operating_company_id, as_of_date) | **money** — opening-balance register |
| accounting.bill_lines | (bill_id, line_sequence) | **money** — QBO bill-line puller |
| driver_finance.trip_link_queue | (expense_id, expense_table) | money-adjacent — trip-link queue, not a ledger row itself |
| driver_finance.team_settlement_splits | (load_id, driver_id) | money-adjacent — split config, not a posted amount |
| master_data.customer_relationship_scores | (customer_uuid) | low — derived score, recomputed, no owner data lost |
| public.idempotency_keys | (key) | low — infra idempotency cache |
| maintenance.work_order_seq_per_month | (operating_company_id, year_month) | low — sequence counter |
| identity.user_notification_preferences | (user_uuid) | low — user prefs |
| notifications.user_notification_preferences | (user_id) | low — user prefs (separate schema, same shape) |
| chat.message_receipts | (message_id, participant_id) | low — read-receipt state |
| driver_pwa.push_subscriptions | (endpoint) | low — push endpoint registration |
| dispatch.load_cancellations | (load_id) | medium — cancellation record, operator-entered reason could be overwritten by a second cancel call |
| dispatch.customer_notify_preferences | (operating_company_id, customer_id) | low — notify toggle |
| brokerupdate.profile | (operating_company_id, email) | low — broker contact profile |
| admin.launch_toggles | (operating_company_id) | low — feature flag |
| compliance.drug_alcohol_pool_members (×1) | (operating_company_id, driver_id) | medium — DOT compliance membership, re-derivable |
| compliance.drug_alcohol_random_draws | (operating_company_id, year, quarter) | medium — DOT random-draw record |
| compliance.appraisal_districts | (state, county, cad_name) | low — reference catalog |
| search.universal_index | (operating_company_id, entity_type, entity_uuid) | low — search projection, recomputed |
| catalogs.form_425c_company_profiles | (operating_company_id, company_key) | low — profile config |
| safety.permit_renewal_reminders | (operating_company_id) | low — reminder cadence |
| integrations.samsara_vehicles / samsara_drivers | (operating_company_id, samsara_*_id) | low — vendor-mirror rows, source of truth is Samsara |
| integrations.samsara_config | (operating_company_id) | low — integration config |
| fuel.fuel_transactions | (operating_company_id, source_row_hash) | medium — hash-deduped import, DO UPDATE only refreshes derived fields |
| mdata.assets (×2 callers, same shape) | (tenant_id, unit_code) | medium — asset identity row, not money itself |
| mdata.maintenance_parts / maintenance_services | (operating_company_id, sku / service_code) | low — seed catalogs |
| maintenance.pm_auto_engine_settings | (operating_company_id) | low — PM engine config |
| catalogs.maintenance_vendors | (operating_company_id, code) | low — vendor catalog |
| mdata.qbo_customers / qbo_vendors / qbo_accounts | (id) | low — QBO mirror, source of truth is QBO |
| owner.todays_attention_snapshot | (operating_company_id, item_id) | low — derived dashboard snapshot |
| reports.deadhead_cache | (unit_id, week_starting) | low — report cache |
| tasks.task_type | (operating_company_id, name) | low — catalog |

**Document-create check (repeat of the GO-06 pass, re-confirmed clean):** `docs.file_links` —
the actual document-create/link table — has **zero** `DO UPDATE` sites; both insert paths use
`ON CONFLICT ... DO NOTHING` (one partial-unique-index-backed, one relying on a bare 23505 catch
→ 409). No document-create upsert anywhere in the 72 overwrites on conflict.

Full evidence + prior GO-10 (display_id) numbering findings on `docs/audit/GUARD-WORKORDERS.md`
and this file's earlier entries. Nothing built. Idle, watching for GO-10 merge to run A–E.
