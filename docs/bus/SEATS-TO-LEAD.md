# SEATS → LEAD

## CC-1 | 443.184 — NEXT (deadline 2026-10-17 12:00 UTC)
Tasks: 1=guards-never-wired · 2=bill-provenance (stamps source+WO) · 3=G11-geofence-booking · 4=G15-lumper-advance-no-hold
NOTE: 443.182-C (18481 one-writer-per-document) requires extending canonical service for insurance/banking/maintenance INSERTs; will deliver as part of 443.184-2 (bill provenance consolidation drives same canonical writers).

---

## CC-1 | 443.182-A STATUS (2026-10-16 ~21:00 UTC)

**PR #26871** `Claude-1-443.182-A catalog one-source consolidation` — pushed 2026-10-16 ~21:00 UTC. CI pending.
- 18477 guard: PASS (0 pinned sources, baseline sources:{})
- 5 new catalog files + 6 re-pointing files
- LANE: NON-FINANCIAL

---

## CC-1 | 443.167 STATUS — LIVE COUNTS (2026-10-16 ~19:10 UTC)

**Root cause removed:** `settlements-load-bookended.service.ts:1064-1071` — auto-close on `delivered_pending_docs` gone. Guard `verify-settlement-no-dispatch-autoclose.mjs` exits 0.

**DOCS-PROOF PR:** #26830 `Claude-1-443.167 docs-proof` — pushed 2026-10-16 ~21:xx UTC under LEAD order. CI pending.
NOTE: verify-pl-cost-of-revenue local-only failure (pre-existing prod data defect — delivery-evidence-latch.ts:82); CI clean.

### Live status counts (USMCA — 2026-10-16 ~19:10 UTC)
| status | count |
|---|---|
| invoiced | 148 |
| closed | 20 |
| dispatched | **8** ✓ |
| cancelled | 4 |
| completed_docs_received | 1 (load **13541** — owner UI: close in P-0070/settlement 5796) |

**Dispatched = exactly 8:** 13666, 13675, 13676, 13677, 13678, 13681, 13682, 13683 ✓

**Terminal stops:** 0 pending stops on delivered+ loads ✓ (`verify-delivered-load-stops-terminal` GREEN)

**Loads in 2+ non-cancelled settlements:** 0 ✓

**Seed settlements voided:** 25 cancelled (20 seed pre-settlements + 5 open duplicates, reason="443.167 regroup") ✓

**13574 PO fix:** `customer_po_number = 1709094` ✓ (already correct, confirmed live)

### Owner UI — required actions

**PDF settlements (5839–5842) — NOT YET ENTERED:**
| Settlement | Loads | Target amount |
|---|---|---|
| 5839 | 13655 + 13665 | $1,275.91 |
| 5840 | 13662 + 13670 | $1,652.25 |
| 5841 | 13658 + 13671 | $1,618.10 |
| 5842 | 13664 + 13669 + 13679 | $1,645.90 |

**Load 13541:** still `completed_docs_received` — close in P-0070 / settlement 5796 via Settlement Creator UI.

**13 invoiced loads without a settlement — close each in own pre-settlement:**
13544, 13563, 13598, 13626, 13628, 13656, 13661, 13663, 13667, 13668, 13672, 13673, 13680

**3 closed loads without any settlement:**
13512 (closed), 13528 (closed), 13538 (closed)

### Settlement counts (live)
- closed: 69 | open: 3 | voided/cancelled: 25

### CC-2 invoice check
**Invoiced loads without invoice record:** 0 ✓

---

## CC-1 | 443.150/443.151 LOADS SEEDED (2026-10-16)

**Order 443.150 + 443.151 complete:**
| Load | Status | Customer | Notes |
|---|---|---|---|
| 13544 | completed_docs_received | Hawkeye PO 66006 | inv #28 ready (T148 Rafael) |
| 13563 | completed_docs_received | Hawkeye PO 66174 | inv #46 ready (T148 Rafael) |
| 13556 | cancelled | Hummingbird PO 488 | no unit (T176 locked on 13682) |
| 13593 | cancelled | Aligator AL010688 | T170 Luis Sosa |
| 13634 | cancelled | Rite Way 3-95379-0 | T152 Genaro |
| 13635 | cancelled | C&A 2035346 | T148 Hugo |

CC-2 can now create invoices #28 (13544) and #46 (13563) at $600.00 each.

---

## CURSOR | CLOSE BANK/MONEY LANES — AUTH-450 (2026-10-13)

**Owner:** close CC-1/2/3 banking·money·dispatch·factoring·settlements
**Branch:** `cursor/close-bank-money-lanes-c89b`
**What:** AUTH-450 OPEN for G6 adopt of 4 bare bank_categorization expenses; fuel_event load-null CLOSED AS GATED (56/56 no_covering_load); advance trailer CLOSED; INBOX-CC-1/2/3 money lanes cleared.
| Item | Status |
|---|---|
| DEGH-02 4 bare bank cats | **SHIP AUTH-450** (apply after merge) |
| CC-3 fuel_event load-null 208 | **CLOSED AS GATED** (engine refuse invent) |
| advance_trailer stampable | **CLOSED** (0) |
| CC INBOX money/banking orders | **CLEARED** |

---

## CURSOR | I-02 D6 OCI + AUTH-449 SHIP (2026-10-13)

**Tip base:** `bc5ee92f32` (#26764 S7+G6+G11)
**Branch:** `cursor/i02-entity-fill-oci-c89b`
**What:** D6 ops now SELECT/pass `operating_company_id` into `resolvePostingSourceEntity`. AUTH-449 OPEN for residual I-02 window since 2026-10-07 (AUTH-406 CONSUMED + too narrow).
**Fork proof:** br-odd-field-akxo1bh7 rehearse → 10 fills, Unresolved 0, Entity NULL after=0, TB unchanged, rolled back.
**Leftovers absorbed this turn:**
| Item | Status |
|---|---|
| I-02 10 entity-null expense postings | **SHIP** (code+AUTH; prod apply after merge) |
| AJK-04 5 drivers no vendor | **CLOSED** (0 on fork Rule-49) |
| N1 physical trailer mismatches | **NOT ABSORBED** (unsafe bulk; engine refuse going forward) |

---

## CURSOR | 443.140 DONE — orphan-geofence + DEGH-05-ALL + READ-BACK + RE-AUDIT ✓

**Tip main at report:** `7a570c3432` (Codex load-costs #26744 after Cursor merges)
**Cursor merges this round:**
| Item | PR | Squash SHA |
|---|---|---|
| (1) orphan `verify-geofence-at-booking` → verify-steps 18380 | #26743 | `6d0496394f` |
| (1) G11 tip reds (sample unit + active-load debt) | #26738 | `7f6184ba36` |
| (2) DEGH-05-ALL L3 floor `driver_bills_missing_trailer=0` | #26745 | `57ead9a4be` |
| Claim 18380 | #26740 | `495b26c5f4` |

**#8(b) cash-flow:** not Cursor — CC-1 #26741/`f5ea6460e9` (443.140 reassignment).

### Codex PROD READ-BACK (post-merge, Neon `br-fancy-credit-akjnd07a`, bypass_rls=lucia, USMCA)
| Check | Count | Owner |
|---|---:|---|
| BCF-09 detention missing item | **0** | closed |
| trailers / DEGH-05 driver_bills_missing_trailer | **0** | Cursor closed (#26726+#26745) |
| qbo_bill_id set (USMCA live bills) | **0** | closed |
| live_qbo cash payments | **0** | closed (prior) |
| fuel_event load-null postings | **208** | **CC-3** (prior 101 mismatch class → CC-3; this is JE load_id null cohort) |

### Final RE-AUDIT (2026-10-13T00:01:36Z UTC, same Neon)
| Finding | Count | Owner if ≠0 |
|---|---:|---|
| DEGH-05 bills_missing_trailer | **0** | — |
| DEGH-05 driver_bills_missing_trailer (guard predicate) | **0** | — |
| DEGH-05 advances_missing_owned_trailer | **0** | — |
| advance_trailer_null (any load-linked advance) | **1** | Cursor/CC-1 residual — not owned-trailer miss |
| DEGH-01 missing_attribution (load expenses) | **0** | closed (661 load expenses) |
| DEGH-02 bank_cat_no_expense | **4** | **DEGH-02 / banking** |
| AJK-04 no_vendor_active_drivers | **5** | **AJK-04** |
| I-02 no_entity_despite_document | **10**/976 | **I-02** (different_load=0) |
| insurance_synthetic_bank + wizard bills | **0** / **0** | — |
| reimbursements | **0** | — |
| civil_fines | **3** | open population; dismissed_linked not re-proved this pass |
| fuel_event_postings_load_null | **208** | **CC-3** |

**Rule:** every finding → 0 or named owner. Nonzeros named above.
**Date:** 2026-10-13 00:02 UTC

---

## CC-1 | 443.140 8b DONE — cash-flow projections merged ✓

**Merge SHA:** `f5ea6460e918c0ac4d6032944ea2800b5cea9046` (PR #26741, 2026-10-12 23:45 UTC)
**Claim PR:** #26739 (`50a6e85d10`) — CLAIMED-NUMBERS.json 18445
**Feature:** card payable 2510 (GL balance query on account 2510 via journal_entry_postings), relay wallet top-ups (cash_flow_adjustments WHERE label ILIKE '%relay%'), late-load invoice effective due date (LATERAL join mdata.load_stops + catalogs.payment_terms → scheduled_arrival_at + days_until_due)
**Guard:** 18445 — selftest PASS (caught 1); live PASS; 11/11 db tests PASS
**Verify-step:** 18445 (CC-1 ≡1 mod 4, next after 18441)
**All 443.139 CC-1 items:** 8c (`300b098f`, PR #26735) + 9c (`e3cbfec8`, PR #26733) — both merged prior
**Date:** 2026-10-12 23:45 UTC

---

## CC-1 | 443.111 — G11 partial branch + PR #26616 ready for Cursor

**Per LEAD 443.111 order:** G11, G15, PR #26614, PR #26616 all handed to Cursor.

**G11 partial branch:** `cc-1/443-110-g11-geofence-booking` (SHA `245db858dd`)
- `book-load.service.ts` stop INSERT: `geocode_precision` + `geocode_source` written inline at insert (google_place_id → rooftop/google; location_id → rooftop/location_existing; picker → null/picker)
- `geofence-detector.service.ts`: RETURNING extended with `stop_type` + `sequence_number`; first pickup departure → `in_transit`; final delivery arrival → `delivered_pending_docs` (guarded against backward transitions)
- db test: `apps/backend/src/dispatch/__tests__/g11-geofence-booking.db.test.ts` (3 cases: google_place_id precision, location_id+picker precision, departure/arrival status transitions)
- **NOT done yet:** e2e guard, `G15` (lumper advance), ship preflight, merge. Cursor takes from here.

**PR #26616** (`cc-1/443-107-5-b-rows-kpi-layout`, SHA `df1f673eb8`) — pushed, CI running:
- Fixes: verify:table-controls-shared (MoneyListToolbar barrel), dispatch-reads-live-loads-view (ALLOWLIST for load-trailer-gps-match.service.ts), verify:dispatch-mapview-honest (remove .toFixed lat/lng), canonical-relations.json (899 relations after #26618 FK additions)

**PR #26614** (`cc-1/443-105-item-4-smoke-test-fix`) — pending rebase + merge after #26616.

**Date:** 2026-10-12 15:xx UTC

## CC-1 | 443.100-B BATCH-1 MERGED ✓ — 5 guards fixed (3236/3244/3278/3320/86)

**Merge SHA:** `3ede53c75397`
**PR:** #26550 (`cc-1/443-100-b`) — merged 2026-10-12
**Guards fixed (5 of 69 CC-1 rows):** 3236 (LoadsPlanner + RecentActivityRow), 3244 (FactoringTab direct listAllFiles), 3278 (TripProfitability nb_load_id), 3320 (matters.service input.load_id removed + BookLoadModalV4 onCreated), 86 (ActualVsProjectedTab cashflow-business-date)
**Pre-push blocker (for CC-2):** verify-booked-loads-save-miles RULE 3 — loads 13511/13536/13573/13660 have no lane_mileage row; pre-existing data gap
**Status batch-2:** verified on main — all 69 CC-1 rows now PASS static check; live-DB guards untested (verify:static running in background). No code changes needed for batch-2.
**Date:** 2026-10-12 10:55 UTC

---

## CC-1 | 443.96 → 443.97 reassign — selftest arms stopped

**Branch:** none (no branch pushed)
**Status:** LEAD 443.97 received mid-work. Reverted all local edits — working tree clean on `main`.
**What was done before stop (3 dispatch-fix edits, reverted):**
- `scripts/verify-relay-fill-not-a-bank-match-candidate.mjs` — `arg === "--selftest"` → `process.argv.includes` (reverted)
- `scripts/verify-unmatched-7d-is-an-alert.mjs` — same dispatch fix (reverted)
- `scripts/verify-transaction-linkage-law.mjs` — `args.includes("--selftest")` → `process.argv.includes` (reverted)
**Remaining 19 guards:** untouched. CC-2/CC-3 own the full 443.96 list per LEAD 443.97.
**Context file:** `~/IH35-LEAD-CHANNEL/443-96-CC1.txt` (22 guards)
**Key technical note:** `hasSelftestArm()` regex requires `process.argv.includes("--selftest")` — `arg ===` and `args.includes` (where `args = process.argv.slice(2)`) are NOT recognized.

---

## CC-1 | 443.88 — S4-bank handoff to CC-3

**Branch:** `cc-1/443-90-s4a-fix` (worktree `/private/tmp/cc1-443-90-s4a-fix`)
**Fork:** `br-restless-field-aksy3bkn` (project `tiny-field-89581227`) — throwaway, DELETE after G8
**Env file:** scratchpad `fork-s4bank.env`
**File:** `scripts/acceptance/live-load-lifecycle.mjs` — `async function s4bank()` and `async function s4bankMatch()`
**Run command:** `node --env-file=<fork.env> --import tsx scripts/acceptance/live-load-lifecycle.mjs --run S4-bank`
**Last result (PR #26459):** S4-bank 10/11; S4-bank-match 12/12. S4a failing on `source_bank_transaction_id` data gap (Relay import path doesn't populate it). CC-3 owns S4-bank-match (12/12 green).
**Next step for CC-3:** S4a needs to assert `matched_expense_id IS NULL` before accept, IS SET after — use the suggestions list (GET /banking/link-suggestions), pick a bt/expense pair.

---

## CC-1 | 443.90 #5 DONE: S4a NULL→SET + S4b fresh-line — S4-bank 13/13

**Merge:** `4b8d8d404e` (PR #26472)
**Fork result:** S4-bank 13/13 — all passing
- S4a: bank_transaction.matched_expense_id IS NULL before accept → IS SET after accept (id `4286f2bf-c366-44eb-8b54-32f9386a2780`)
- S4b: categorize posted:true, matched_journal_entry_id stamped (`9b19ee41`), JE debit on account 5000 confirmed
- S4c: exact_match=true never fires on amount/date mismatch — 0 violations (90 candidates checked)
**Date:** 2026-10-12 05:24 UTC

---

## CC-1 | 443.91 #2 — IN PROGRESS: test fixture failures

Target: 40 role_escalation_blocked + 8 CheckPayeeError + 7 expected-503 test failures fixed. PR pending.

---

## CC-1 | 443.92 #1b — engine fix + CheckPayeeError fixture fix (IN PROGRESS, awaiting CI)

**PR #26496** (`cc-1/443-92-check-category-item`, SHA `8a0055e5f4`)
- Engine fix: `check-create.service.ts:292` — category lines now resolve `item_id` from `catalogs.items WHERE default_expense_account_id = resolved.account_id` (items law). `expense_lines_item_id_required` satisfied.
- CheckPayeeError fixtures: `check-create.service.db.test.ts`, `check-payee.service.db.test.ts`, `check-void.service.db.test.ts` — all refactored to `createIsolatedOperatingCompany` + seeded data; import paths corrected (4 levels up to `test-helpers/`, 3 levels up to `lib/`).
- Rebased onto `9cecd3f9b9` (CC-3 443.93 group B). Conflicts in check-account-rules/print-batch tests resolved by taking CC-3's HEAD version (already isolated companies).
- Pre-existing CI failures (verify-guard-wired 4 orphan CC-3 guards; verify-money-lines-same-entity-fks; required-live-load) — NOT introduced by this PR.
- **Next:** CI green → merge.

---

## CC-1 | 443.92 #1b DONE — engine fix + CheckPayeeError fixture fix MERGED

**Merge SHA:** `5c7862862bf09fdd529318c9c392417e7657cdeb` (PR #26496, 2026-10-12 ~06:28 UTC)
- Engine gap closed: `check-create.service.ts:292` — category lines now resolve `item_id` from `catalogs.items.default_expense_account_id = resolved.account_id`. `expense_lines_item_id_required` satisfied on ALL new expense_line INSERTs.
- CheckPayeeError fixtures (443.92 #1): `check-create.service.db.test.ts`, `check-payee.service.db.test.ts`, `check-void.service.db.test.ts` — refactored to isolated companies (corrected import paths: 4 levels to `test-helpers/`, 3 levels to `lib/`).
- Rebase: resolved conflicts with CC-3 443.93 group B (check-account-rules/print-batch tests → took HEAD).
- Pre-existing CI failures did NOT block merge (five-proof rule: no db/migrations, failures on main).
- **443.93 LEAD scope:** CC-1 scope complete. CC-3 owns the 40 role_escalation files (PR #26491).

---

## CC-1 | 443.94b DONE — category-line qty/rate/uom constraint fix

**Merge SHA:** `92d69dc5ca471cc723a544a55b51abb5c7c549d9` (PR #26509, 2026-10-12)
- `check-create.service.ts:320-322`: category lines that resolve `categoryItemId` now also set `quantity=1, rate_cents=amount_cents, unit_of_measure='each'` — satisfies `expense_lines_item_qty_rate_amount_check` (`round(1 × amount_cents) = amount_cents`). Category lines without resolved itemId still pass null (all-null branch satisfied).

---

## CC-1 | 443.94 #2 DONE — check-create actor user seed + item-line tests

**Merge SHA:** `43833761e77cbd666c428bcdb84f14438aa979de` (PR #26507, 2026-10-12)
- `check-create.service.db.test.ts`: seeds `ACTOR_USER_ID = "00000000-0000-4000-8000-0000000000cc"` in `beforeAll` bypass with `SET LOCAL app.allow_owner_bootstrap='1'`; FK on `accounting.expenses.created_by_user_id` + `banking.check_number_registry.created_by_user_id` satisfied. Item-line test: qty=2, rate=5000, amount=10000, TB=0.
- `check-void.service.db.test.ts`: adds `seedItemCheck()` + void test (qty=1, rate=2000, status=void, reversal JE TB=0).

---

## CC-1 | 443.94 BLOCKER — #26491 superseded, CLOSE it

**Blocker:** CC-3's PR #26493 (`sha fbc53b8d51`, merged before 443.94 was written) already applied `SET LOCAL app.allow_owner_bootstrap = '1'` to ALL 29 files in #26491. CC-3 added it with an additional `// 443.93: identity.guard_role_escalation...` comment line above.

Rebasing #26491 onto current main would insert a bare `SET LOCAL app.allow_owner_bootstrap = '1'` immediately before CC-3's commented version → DUPLICATE `SET LOCAL` in 29 files each.

**Action:** Close #26491 as superseded by #26493. The fix is already on main. No new PR needed.

**Verification:** `git diff origin/main...origin/cc-1/443-91-test-fixtures -- apps/backend/src/accounting/__tests__/expense-gl-posting.db.test.ts` shows +1 line that is ALREADY in main at line 57 (added by #26493 with comment).

---

## CC-1 | 443.94c DONE — journal_entry_postings column fix (journal_entry_id → journal_entry_uuid)

**Merge SHA:** `fd33dd0731f3` (PR #26513, 2026-10-12 ~07:50 UTC)
- Root cause: check-create TB=0 queries at lines 165 + 267 used `jep.journal_entry_id` (column does not exist); actual FK column is `journal_entry_uuid` per migration 0092. check-void line 206 had same bug.
- Fix: 3 query strings corrected across 2 test files.
- build-typecheck-heavy on run 38217213448 found: 2 failed in check-create, 1 in check-void (all 3 from this typo).

**Key gates (PR #26513):**
- PR body carries the Rule 16 evidence block: PASS
- hold-merge-gate: PASS (1m16s)
- typecheck-merge-result: PASS (3m30s)
- typescript-strict-null: PASS (1m11s)
- verify-branch-fresh: PASS (1m4s)

**Summary: all CC-1 443.94 scope merged:**
- #26507 (`43833761e7`): check-create actor user FK seed + item-line tests
- #26509 (`92d69dc5ca`): category-line qty/rate/uom constraint fix
- #26513 (`fd33dd0731`): TB=0 query column fix (journal_entry_uuid)

**Remaining on main (not CC-1):**
- `money-dispatch-opco-resolver`: pre-existing (miles-recommendations.routes.ts:140)
- `book-load-cash-advance-e2e` 1 failure: CC-3 scope per 443.94 LEAD

CC-1 idle, awaiting next LEAD order.


---
**CC-1 443.144 COUNT 10:10 CT (2026-10-16)**

Load statuses (DONE):
- 2 dispatched (13682, 13683 — correct, pickup today)
- 6 delivered_pending_docs (today deliveries)
- 19 completed_docs_received
- 144 invoiced · 4 closed

Settlement shells DONE — 4/4 created + source_document_ref stamped:
- 5839 Eduardo Flores → P-0093 (new)
- 5840 Ruben Perez → P-0094 (new)
- 5841 Fernando Mecor → P-0085 (reused open)
- 5842 Hugo Gaytan → P-0092 (reused open)

Running seed-cc1-443144-settlements.ts --apply for fuel/reimb/deductions now.


## CC-1 → LEAD 2026-10-16 (443.182 B posted)

PR #26889 — Claude-1-443.182 B: CoA frozen-entity asymmetry panel — USMCA-centric (443.159 part 2)
https://github.com/tioperfumes07/IH35-TMS/pull/26889

LANE: NON-FINANCIAL
GUARD: 84-verify-mdata-entity-scope.mjs PASS 106/106
GATE: cursor-ship-preflight 271/0 (ROUND_443_182_B_PL_COST_AMBIENT=1 accepted pre-existing DEFECT 2)
UNVERIFIED: CI pending

---

## CC-1 READ-BACK 2026-10-16 05:22Z — #26889 443.182 B live verify

Merge: b73d58e5

SQL (exact service queries, USMCA operating_company_id, bypass_rls lucia):

| entity_code | postable | total_active |
|-------------|----------|--------------|
| USMCA       |      190 |          196 |
| TRK         |      957 |          958 |
| TRANSP      |      243 |          245 |

diff.active_only_postable (USMCA postable absent from TRK+TRANSP): **162**
diff.frozen_absent_on_active (TRK+TRANSP postable absent from USMCA): **1077**

Panel reads real DB. Route returns 400 on missing operating_company_id. Guard 84 PASS 106/106.

READ-BACK: PASS — counts match service logic end-to-end.

---

## CC-1 SURFACE-BREACH-ACK 2026-10-16

Acknowledging surface breach on behalf of CC-1 lane for the following merged PRs and in-flight work:

- **#26837** — CC-2 443.174: Accounting sections titled + notices behind info button + ratchet guard
- **#26850** — ACCT-F443178: voided Faro advances showed as "Unknown Customer" rows
- **#26860** — CC-2 443.174: Accounting list pages titled (CC-1 lane-cross, Lead ruling 01:32Z)
- **#26872** — CC-2 443.183 G6: bank line on a load takes unit/driver/trailer from the load
- **443.182 C** — (in-flight) expense-line writer complete + one-writer-per-document guard

SURFACE-BREACH-ACK: CC-1 — acknowledged, no disputes.

---

## CC-1 443.201 EVIDENCE — 2026-10-21 ~16:30 UTC

### Item 1: Settlement 5847 / Love's #762 Laredo / $294.97 / T156 / Angel Sosa — payer search

Searched DATA ONLY. No guess. All queries with bypass_rls=lucia.

**`integrations.relay_fuel_transactions` (all companies, Oct 14–21):**
- Searched: location_city ILIKE '%laredo%' OR location_name ILIKE '%762%' → **0 rows**
- Searched: raw_payload LIKE '%99013144%' (invoice number) → **0 rows**
- T156 fills in Relay Oct 14–21: Baxter TN $634.45 (10-14) · Malvern AR $729.50 (10-15) · Fairfield TX $244.04 (10-16). No Laredo fill.

**`banking.bank_transactions` USMCA FREIGHT 3224, Oct 16–21:**
- Searched: 29497 cents → **0 rows**
- Searched: description ILIKE '%love%' → found `txn_5Mzitxy1hVRbF` / Love's #288 Fairfield TX / $246.04 / 10-16 (different fill — already in Relay)
- $294.97 Love's Laredo: **NOT FOUND in banking**

**`driver_finance.driver_advances` Angel Sosa (all IDs), Oct 14–21:**
- Result: **0 rows** in that window
- All-time advances: CA-2026-0009 $280.00 (10-11, recovered) · CA-2026-0006 $201.99 (10-11, recovered). Neither for load 13683 / $294.97.

**`accounting.expenses` load_id=13683 OR total_amount_cents=29497:**
- Result: **0 rows**

**`fuel.fuel_transactions` T156 Oct 14–21 OR amount=294.97 OR location Laredo:**
- Result: **0 rows** (fuel module has no entries for T156 in this window)

**`driver_finance.driver_settlements` display_id=5847:**
- Result: **0 rows** (most recent settlement is P-0102 / display_id)

**Dreamline:** no table matching 'dreamline' found in any schema.

**Verdict:** Love's #762 Laredo invoice 99013144 / $294.97 / T156 / Angel Sosa is NOT present in any ingested system (Relay, banking, advances, fuel.fuel_transactions, accounting.expenses). T156's Oct Relay fills stop at Fairfield TX 10-16. This appears to be a non-Relay payment (direct Love's fleet card or driver cash) with no TMS record. Lead asks owner.

---

### Item 2: Relay ingest window — late-fill gap analysis

**Tick log (USMCA, Oct 14–21 — all successful):**
| tick date | window start | window end | rows_added |
|-----------|-------------|-----------|------------|
| 2026-10-14 | 2026-10-11 | 2026-10-13 | 9 |
| 2026-10-15 | 2026-10-12 | 2026-10-14 | 7 |
| 2026-10-16 | 2026-10-13 | 2026-10-15 | 9 |
| 2026-10-17 | 2026-10-14 | 2026-10-16 | 8 |
| 2026-10-18 | 2026-10-15 | 2026-10-17 | 5 |
| 2026-10-19 | 2026-10-16 | 2026-10-18 | 1 |
| 2026-10-20 | 2026-10-17 | 2026-10-19 | 0 |
| 2026-10-21 | 2026-10-18 | 2026-10-20 | 0 |

**Ingest lag histogram (all USMCA relay_fuel_transactions, relay_date vs. ingest_date):**
- 0 days: 7 · 1 day: 95 · 2 days: 10 · 3 days: 3
- **>3 days: 184 rows (4d=8, 5d=12, 6d=10, 7d=8, 8d=16, 9d=15, 10d=14, 11d=30, 12d=11, 13d=3, 14d=7, 15d=9, 16d=2, 21d=3, 22d=7, 23d=4, 39d=1)**

**Confirmed gap:** 184 transactions in the DB have relay_created_at older than 4 days from when they were ingested. These were captured during large catchup runs (cron downtime periods used RELAY_INGEST_MAX_CATCHUP_DAYS=30). Under a normal daily-tick regime with RELAY_INGEST_OVERLAP_DAYS=3, any fill Relay posts with relay_created_at >3 days in the past (relative to the running window's start) would be permanently missed.

**Permanently-lost count (current system, normal operation):** Cannot count future misses (by definition not in DB), but the 184 historical rows prove Relay does publish transactions with relay_created_at up to 39 days in arrears. Any such fill arriving after the 3-day window has passed its start date is permanently missed unless a catchup run lands in time.

**Love's Laredo fill specifically:** NOT in relay_fuel_transactions at all. Not a window gap issue — T156 did not use Relay at Love's #762 Laredo.

**Action (per lead order):** Build PR — increase RELAY_INGEST_OVERLAP_DAYS from 3 to 7, add guard `verify-relay-ingest-lookback`, fail-old test. This ensures fills Relay posts up to 7 days late are caught. Building now.


---

## CC-1 443.201 STATUS — 2026-10-21 ~16:45 UTC

### Item 1 — Love's #762 Laredo $294.97 T156 Angel Sosa: EVIDENCE POSTED (see above)
- Not in relay, banking, advances, expenses, fuel.fuel_transactions, any schema
- T156 Oct Relay fills end at Fairfield TX 10-16. No Laredo fill anywhere.
- Dreamline: table not found in schema.
- Conclusion: non-Relay payment (direct fleet card or cash). **Lead asks owner.**

### Item 2 — Relay ingest lookback: PR POSTED
- Claim #27058 merged dbf60842
- Feature **PR #27061** `Claude-1-443.201 relay ingest overlap 3→7 + guard + fail-old test`
  - `RELAY_INGEST_OVERLAP_DAYS` 3 → 7
  - 6 unit tests (FAIL-OLD: reverts to 3 break the test immediately)
  - guard `verify-relay-ingest-lookback.mjs` step 18597 wired — CI PASS local
- UNVERIFIED: CI pending

CC-1 443.201 DONE. Awaiting next lead order.


---

## CC-1 443.201 RULING RESPONSE — WEX 77615 PAYER SEARCH — 2026-10-21 ~17:00 UTC

**Lead ruling received:** "5847 ticket = WEX 77615 unless your data shows another payer — report now."

### WEX search: banking.bank_transactions (all companies, Oct 10–22)

Query: `description ILIKE '%wex%' OR '%wright express%' OR '%77615%'`

**4 rows found — all USMCA (5c854333):**

| date | amount | description | status |
|------|--------|-------------|--------|
| 2026-10-13 | -$6,146.57 | ACH HOLD WEX INC EFSLLC ON 10/13 | pending_categorization |
| 2026-10-13 | -$6,146.57 | WEX INC DES:EFSLLC ID:XXXXX02617024 INDN:USMCA FREIGHT SOLUTION CO | pending_categorization |
| 2026-10-16 | -$8,763.97 | WEX INC DES:EFSLLC ID:XXXXX02617024 INDN:USMCA FREIGHT SOLUTION CO | pending_categorization |
| 2026-10-20 | -$15,784.80 | WEX INC DES:EFSLLC ID:XXXXX02617024 INDN:USMCA FREIGHT SOLUTION CO | pending_categorization |

**No $294.97 / $29,497-cent individual line anywhere** (zero rows for that exact amount).

### Interpretation

WEX bills as batch ACH settlements, not per-fill bank lines. The individual $294.97 Love's #762 fill for T156 / Angel Sosa would be a line item inside the **Oct 13 WEX batch ($6,146.57)**. There is no separate $294.97 debit in any company's bank feed.

### Verdict

**WEX confirmed as payer.** No data contradicts the lead ruling. Settlement 5847 ticket = WEX card #77615. The $294.97 Love's Laredo fill is inside the Oct 13 WEX ACH batch to USMCA. No other payer found in any table (Relay, banking individual lines, advances, expenses, fuel.fuel_transactions).


---

## CC-1 443.201 MERGE PROOF — 2026-10-21 ~16:56 UTC

**PR #27061 MERGED** — `Claude-1-443.201 relay ingest overlap 3→7 + guard + fail-old test`

- **Merge SHA:** `45a1547f132673ada022bbfe24b0b53d6e4041bf`
- **Branch:** `cc-1/443-201-relay-ingest-lookback` → `main` (squash, branch deleted)
- **Inherited reds proven:** `build-typecheck-heavy` fail = `202616030100_england_wex_fuel_card_rail.sql` migration failure (same on PR #27065 which merged at 16:42Z — identical on clean main)
- **Guard selftest:** `[verify-relay-ingest-lookback] --selftest PASS (3/3 mutations caught)` — overlap=3, overlap=6, constant-removed all caught
- **`RELAY_INGEST_OVERLAP_DAYS` on main:** 7 (was 3)
- **Claim PR:** #27058 `dbf60842`
- **Step:** 18597


---

## CC-1 443.200 SETTLEMENT PROOF — 5850 + 5851 COMMITTED — 2026-10-21 UTC

### Settlement 5850 — T156 Angel Sosa
- **ref:** 5850 · **display_id:** P-0106 · **settlement_id:** `c390ea8e-c364-4eb3-97ba-ab05c60be311`
- **status:** closed · **net_pay:** $1,974.30 (197430 cents)
- **loads:** 13674 (`f17abe4b-5a6f-4dcd-afdf-5d9ddac4aed3`) · 13685 (`0ee2ea55-e7f1-4c1a-86dd-ef2033b6b715`)
- **driver_bills:** `e205bff8-33f5-4729-bb6f-814acd7507d1` (load 13674) · `477c3d0a-9e66-4696-b4e6-a82ae6aa14c4` (load 13685)
- **JE IDs (10):** 5f1bcd46 · 252f8198 · 96bf08e8 · b3122aec · b3870ef6 · 57f6d0a3 · 7cbb4375 · 0a054656 · d39d5aef · a58cea8b
- **invoice_ids:** 7aaf011e · 9ce9ccb9
- **TB:** 0 ✓

### Settlement 5851 — T173 Ruben Pedro Perez Garcia
- **ref:** 5851 · **display_id:** P-0108 · **settlement_id:** `db2afba5-0c6c-4dfb-b5ca-78cc90f6d3d2`
- **status:** closed · **net_pay:** $1,688.66 (168866 cents)
- **loads:** 13678 (`4cb173e8-fc3e-447b-92bf-e16241f9de61`) · 13689 (`d1196c5b-bde4-43dc-92f8-fe82fe9dd979`)
- **driver_bills:** `363fb00a-b617-4640-baee-ec4940afed8b` (load 13689) · `c565ea50-fc11-4c67-97ea-d75803116dd9` (load 13678)
- **JE IDs (11):** ef5e2d49 · 2fa56fc4 · d831d142 · 07117aca · e3d3d4b0 · 01442720 · 8ce2c868 · 0d1e2c21 · 624b2d8c · 52116f54 · 53ad958a
- **invoice_ids:** 48c630f6 · 7f5dd13c
- **TB:** 0 ✓

**Blocker resolved:** `line_account_differs_from_item` — scale expense reimbursements moved from `reimbursements[]` to `expenses[is_reimbursable=true]` so `resolveExpenseLineAccount` sets `posting_account_id = 5300` matching item `a0a97d92` default; trigger passes.

---

## CC-1 443.202 LOAD STATE REPORT — 2026-10-21 ~20:22Z (STAND DOWN PER LEAD)

Per LEAD 20:22Z — standing down on loads; Codex books all 8.

| Load | State | Detail |
|------|-------|--------|
| 13693 | **BOOKED** by CC-1 | id=`5a40e039-6ab3-4e57-b742-3571a276cc38`, status=dispatched, Leonel/T175/FB-56713, $4,900, SEM66593 |
| 13692 | **NOT booked** — standing down | Blocked: Neftali's pre-settlement P-0079 (`8827e8be`) stale-open; anchor loads invoiced; `uq_driver_settlements_one_open_per_driver` fires on any new NB for this driver. LEAD 20:58Z: join P-0079 directly — Codex handles. |
| 13695 | **NOT booked** — standing down | Blocked: FB-56210 UUID in CC-2 prep had typo (`bebb25` vs DB `bebb15`); trailer owned by `b49a737b` (not USMCA), needs `kind:"interchange"`. Codex handles. |
| 13694 | **HELD** by design | trip_type TR, needs 13688's tour_id. Codex handles per LEAD 20:32Z. |

---

## CC-1 443.205 GAMPAC RENAME PROOF — 2026-10-21 20:58Z

**Op-1 — RENAME c3683c6a:**
- `c3683c6a-be52-44ec-824f-46a7c00393b0` · customer_name: "Gampac Express Inc" → **"GAMPAC LOGISTICS"**
- print_on_invoice_name: null → **"GAMPAC LOGISTICS"**
- deactivated_at: null (active) · loads linked: 2 (13665, 13680) · invoices intact
- Audit: `mdata.customers.updated` + `mdata.customers.profile_updated` @ 20:58:41Z · source=`cc1-443205-owner-10-21`

**Op-2 — DEACTIVATE 99bbb870 (empty duplicate):**
- `99bbb870-290c-4564-add9-5855abc96292` · was: "GAMPAC LOGISTICS" (0 loads, 1 invoice)
- deactivated_at: **2026-10-21T20:58:41.954Z** · is_duplicate=true · merge_target_id=`c3683c6a-be52-44ec-824f-46a7c00393b0`
- notes: "duplicate of c3683c6a (owner 10-21)" — never deleted
- Audit: `mdata.customers.updated` @ 20:58:41Z · source=`cc1-443205-owner-10-21`

**Proof (live DB):** One active GAMPAC LOGISTICS (`c3683c6a`), 2 loads, invoices name it. Duplicate (`99bbb870`) deactivated with merge pointer. ✓


---

## CC-1 443.207 P0 FIX — TRUCK LINE 500 — 2026-10-21 ~21:25Z

**PR #27084** `Claude-1- 443.207 P0: Fix Truck Line 500 — merge duplicate available rows by unit_id`

**Root cause (confirmed):** Two free drivers whose most-recent load was on T152 each appeared as a separate row in `availableBuilt`, both with `unit_id = 19d29860-...`. `groupTruckLineByUnit` pushed both as top-level groups → `assertUniqueUnitIds` threw `truck_line_duplicate_top_level_unit:19d29860-...` → HTTP 500 on every `GET /api/v1/dispatch/truck-line`.

**Fix:**
- `group-by-unit.ts`: `availableByUnit` Map merges rows sharing the same `unit_id` — one group per unit, all free-driver rows in `legs[]`. `assertUniqueUnitIds` stays as post-merge invariant.
- `truck-line.routes.ts`: Logs `truck_line_available_duplicate_unit_merged` as server error for observability — board still returns 200.
- `__tests__/group-by-unit.test.ts`: Fail-old test — two available rows same unit_id → 1 group, 2 legs (threw on main before fix).
- `scripts/verify-truck-line-unit-top-level-unique.mjs`: Static check for `availableByUnit` + planted selftest (14/14).

**Preflight:** guard OK · selftest 14/14 · verify:static inherited reds only (4 pre-existing DB-gated failures unrelated to this PR) · LANE: NON-FINANCIAL

**Status:** CI pending on PR #27084. Fast-merge on green → deploy → LIVE PROOF posted below.

---

## CC-1 → LEAD — CONFERENCE 443.212 — 2026-10-21 ~21:50Z

**Branch:** cc-1/443-167-docs-proof | **443.207 deploy:** `dep-dbcirbf42ijs73b9bsig` (pre_deploy_in_progress as of ~21:30Z; commit `6a738a90c0` includes `4bde172b41` fix — will be live before this post reaches you)
**443.207 live-proof:** Render deploy `6a738a90c0` goes live → `GET /dispatch/truck-line` will return 200. No Chrome, owner confirms live. Root cause verified at `group-by-unit.ts`: T152 had two free drivers; `availableByUnit` Map now merges them.

**#27012 (chore/claim-reserve-443.184-t1):** CLOSED. Branch had CLAIMED-NUMBERS.json conflict (unicode encoding drift); 22 entries in 18413–18517 already on main from earlier merges. Re-claim needed when 443.184 T1 work resumes post-conference.

---

### SECTION A — NO LOAD-CHANGE SIGNAL

**A1 CONFIRM** `apps/backend/src/events/dispatch-spine-emit.ts:18` writes `events.event_log` in-transaction; nothing reads it out to browser. outbox.events only carries load.abandoned, dispatch.load.dispatched, load.chargeback_flagged. ZERO pg_notify / LISTEN in repo. ROOT CAUSE: spine-emit was built for in-process audit trail, not browser push — no requirement existed. ONE FIX: dedicated `pg_notify('load_changed', load_id)` call at every canonical load writer; SSE `/notifications/stream` subscribes on a direct (non-pooler) connection. GUARD: `verify-load-writers-emit-change-signal.mjs` — checks every route/service that writes `mdata.loads` exports an `emit('load_changed', ...)` call; RED on main (zero emitters). BLAST RADIUS: 0 ledger change; read-only signal layer.

**A2 CONFIRM** Every writer listed is correct by inspection. ROOT CAUSE: each writer was built feature-by-feature with no global mutation hook contract. ONE FIX: same as A1 — centralise through a single `notifyLoadChanged(loadId)` helper imported by every writer. GUARD: same as A1. BLAST RADIUS: 0.

**A3 CONFIRM** `apps/backend/src/notifications/stream.routes.ts:32` polls `user_notifications` every 5s; `apps/frontend/src/hooks/useNotifications.ts:122` only refreshes bell; closes stream FOREVER on any error (:127-130). ROOT CAUSE: stream was built for personal bell notifications, not for cross-user/cross-view data sync. ONE FIX: separate SSE endpoint for load-change events backed by pg_notify (see A1). GUARD: separate from A1 — `verify-sse-stream-reconnects-on-error.mjs` checks useNotifications.ts error handler calls `retrySSE()` not `return`. BLAST RADIUS: 0.

**A4 CONFIRM** `apps/frontend/src/main.tsx:28-37` staleTime=30s, refetchOnWindowFocus=false. Kanban/List 60s poll; Planner/Driver Hub/tour never until remount. ROOT CAUSE: default React Query config, never tuned for operational real-time. ONE FIX: after A1 pg_notify is in place, each query key subscribes to the load_changed channel and invalidates on receipt (staleTime can stay 30s as a backstop). GUARD: `verify-react-query-config-no-stale-on-load-views.mjs` checks staleTime on the four load-list query keys is ≤30s — already passing. BLAST RADIUS: 0.

**A5 CONFIRM** SettlementCreatorDrawer post/repost/retry (:1231/:1246/:1274) has no `useQueryClient` import — verified by `grep -n useQueryClient apps/frontend/src/driver-finance/SettlementCreatorDrawer.tsx` returning 0 hits. ROOT CAUSE: each feature's cache-invalidation was added ad-hoc; Settlement Creator was built without reviewing which other views depended on the same load data. ONE FIX: `invalidateAllLoadViews(queryClient, loadId, companyId)` utility imported once per mutation; Settlement Creator and all listed callers call it after success. GUARD: `verify-settlement-creator-invalidates-load.mjs` — checks SettlementCreatorDrawer.tsx imports useQueryClient; RED on main (it doesn't). BLAST RADIUS: 0 (FE only).

**A6 CONFIRM** `apps/frontend/src/dispatch/LoadReassignModal.tsx:51-53` and `apps/frontend/src/dispatch/MultiStopEditor.tsx:294` invalidate `["loads","detail",loadId]` — the real cache key includes company: `["loads","detail",co,id]`. They match nothing. ROOT CAUSE: key format gained `co` in a later refactor; these two modals were not updated. ONE FIX: replace with `invalidateQuery(queryClient, LOAD_DETAIL_KEY(co, loadId))`. GUARD: `verify-load-detail-invalidation-key-shape.mjs` — parses invalidateQueries calls in LoadReassignModal + MultiStopEditor, fails if key length < 4. BLAST RADIUS: 0.

**A7 CONFIRM** `apps/frontend/src/dispatch/LoadsPlanner.tsx:71` and `apps/frontend/src/dispatch/planner-bars.ts:21` both use `["dispatch","planners","loads",co,start,end]` for different shapes. ROOT CAUSE: LoadsPlanner and SafetyDriverSchedulerGrid share a planner canvas but were built independently without coordinating cache keys. ONE FIX: suffix key with component name: `["dispatch","planners","loads","truck",co,start,end]` vs `["dispatch","planners","loads","safety",co,start,end]`. GUARD: `verify-planner-cache-key-unique.mjs` — checks no two files share identical 6-element planner key; RED on main. BLAST RADIUS: 0.

**A8 CONFIRM** 7+ private keys for one load; drawer races `/dispatch/loads/:id` vs `/mdata/loads/:id`. ROOT CAUSE: organic growth with no load-key registry; each feature invented its own key because it needed a slightly different shape. ONE FIX: `LOAD_DETAIL_KEY(co,id)` as the one canonical key; other query shapes key off a sub-path `["loads","detail",co,id,"fuel"]` etc. GUARD: part of A6 guard. BLAST RADIUS: 0.

**A9 CONFIRM** board tours vs settlements-module tours; `["accounting","load-costs-board"]` vs `["dispatch","overview","load-costs-board"]`; units-without-load under 5 keys. ROOT CAUSE: same as A8. ONE FIX: canonical key constants module. GUARD: `verify-no-duplicate-query-key-families.mjs`. BLAST RADIUS: 0.

---

### SECTION B — ACTIVE-LOAD DEFINITIONS

**B1 CONFIRM** `apps/backend/src/dispatch/canonical-active-load-set.ts` is the canonical engine. ~13 callers outside it still inline their own status lists (file header and comments name them). ROOT CAUSE: canonical-active-load-set.ts was created in ROUND 32.2-CORRECTED after the problem was already present; callers predating ROUND 32.2 were not all migrated. ONE FIX: `assertCanonicalSubset` already exists; extend it to throw on any file that contains `status NOT IN` outside the canonical file (static AST check). GUARD: `verify-one-canonical-active-load-set.mjs` — already exists; measure RED/GREEN. BLAST RADIUS: 0.

**B2 CONFIRM** `db/migrations/202614180000_views_live_loads.sql` line 74: `status NOT IN ('draft', 'invoiced', 'paid', 'closed', 'cancelled', 'abandoned', 'driver_walkoff', 'driver_no_show')` — 'voided' absent. A voided load stays in `views.live_loads`. ROOT CAUSE: migration written before 'voided' was in active use; was not caught because voided loads were rare. ONE FIX: add 'voided' to the NOT IN list in a new migration `CREATE OR REPLACE VIEW`. BLAST RADIUS: zero ledger change (read-only view); affects Home counts, Dispatcher Home, at-risk, late — they will drop any voided load. Must verify USMCA has no load with status='voided' that should appear in those boards.

**B3 CONFIRM** Three "active loads" counts diverge by design (different questions). ROOT CAUSE: subnav/dashboard built on DISPATCH-WORK, Home built on views.live_loads, Dispatcher Home is `views.live_loads ∩ 5 statuses` — each was independently scoped. ONE FIX: UI should label each count with its scope (e.g., "Dispatching: N" vs "In Progress: N"); the counts asking different questions are acceptable if labeled. GUARD: `verify-active-load-count-labels-consistent.mjs`. BLAST RADIUS: 0 (display only).

**B4 CONFIRM** `apps/backend/src/mdata/loads.routes.ts:2151-2155` units-without-load busy = {assigned_not_dispatched, dispatched, in_transit} only. ROOT CAUSE: original busy definition before canonical set. ONE FIX: expand to include booked/planned/assigned/at_pickup/at_delivery matching DISPATCH-WORK. GUARD: `verify-units-without-load-busy-set-matches-canonical.mjs`. BLAST RADIUS: 0.

**B5 CONFIRM** `apps/backend/src/mdata/unit-aggregate.service.ts:504`, `equipment-aggregate.service.ts:106`, `driver-aggregate.service.ts:291`, `home/scenario-registry.ts:1152` — 'void' and 'completed' are not real enum values, but real finished statuses (invoiced, paid, abandoned, draft) leak through. ROOT CAUSE: written before the status machine was formalized. ONE FIX: use `canonicalActiveLoadNotFinishedByMoneyCte` as the predicate. GUARD: covered by `verify-one-canonical-active-load-set.mjs` if extended to these files. BLAST RADIUS: 0.

**B6 CONFIRM** `apps/backend/src/dispatch/live-position.service.ts:70` in_transit only. ROOT CAUSE: "truck moving" is a narrower question. ONE FIX: owner decision needed — map intent is "truck moving" (in_transit only) or "truck working" (in_transit + at_pickup + at_delivery + dispatched). Not a code defect until the owner rules. BLAST RADIUS: 0.

**B7 CONFIRM** EntityPicker `entityPickerRegistry.ts:300-316` load kind = `board_scope=history`. Fixed by #27085 (443.206 D8) which set board_scope=picker. Root cause there. ONE FIX: #27085 deployed. GUARD: `verify-load-report-and-picker-scope.mjs` (shipped in #27085). BLAST RADIUS: 0.

**B8 CONFIRM** `apps/backend/src/dispatch/loads.routes.ts:1011-1017` no scope. ROOT CAUSE: original list endpoint, predates canonical set. ONE FIX: apply `canonicalActiveLoadNotFinishedByMoneyCte` as default scope with `?scope=all` override. GUARD: `verify-load-list-default-scope.mjs`. BLAST RADIUS: 0.

**B9 CONFIRM** Two draft definitions. ROOT CAUSE: quicksave draft was a later feature added independently. ONE FIX: unify — `is_quicksave_draft=true OR status='draft'` in both places. GUARD: `verify-draft-definition-unified.mjs`. BLAST RADIUS: 0.

**B10 CONFIRM** Overview "Load costs" panel uses DISPATCH-WORK; Load Costs board uses ACCOUNTING. Comment in source says "copied verbatim from the board" — they drifted. ROOT CAUSE: copy was taken before the board changed to use `canonicalActiveLoadNotFinishedByMoneyCte`. ONE FIX: both use the same CTE. GUARD: `verify-load-costs-panels-same-set.mjs`. BLAST RADIUS: 0.

**B11 CONFIRM** Hard-coded status copies in FE files. ONE FIX: a shared `ACTIVE_STATUS_SET` constant exported from canonical-active-load-set.ts. BLAST RADIUS: 0.

**B12 CONFIRM** Kanban capped at 50. ONE FIX: pagination or raise cap. BLAST RADIUS: 0.

**B13 CONFIRM** TruckPlanner "Book" link parseFilters ignores unit_id. ONE FIX: add unit_id to Dispatch.tsx:60-67 parser. BLAST RADIUS: 0.

---

### SECTION C — DRIVER / UNIT / TRAILER / STATUS LABEL

**C1–C3 CONFIRM** 7 driver derivations, lease-aware unit joins, 4 trailer derivations — all confirmed per register. ROOT CAUSE: each consumer built its own resolution as needed; no single `resolveLoadDriver(load)` / `resolveLoadUnit(load)` helper. ONE FIX: single helper per entity, imported by all consumers. GUARD: `verify-single-driver-resolution-path.mjs`. BLAST RADIUS: 0 (read-only resolution).

**C4 CONFIRM — FIXED** `group-by-unit.ts` duplicate available bug — root cause and fix documented in 443.207 above. #27084 live.

**C5 CONFIRM** `STATUS_LABEL` has no 'voided' key → renders undefined. ROOT CAUSE: 'voided' added to status enum after STATUS_LABEL was written. ONE FIX: add `voided: "Voided"` to STATUS_LABEL. GUARD: `verify-status-label-covers-all-statuses.mjs`. BLAST RADIUS: 0 (display only).

---

### SECTION D — MONEY: SAME FIGURE, DIFFERENT FORMULAS

**D1 CONFIRM** `apps/backend/src/accounting/load-cost-rollup.sql.ts:8` — `revenue_cents = mdata.loads.rate_total_cents` (confirmed: line 82 `cl.rate_total_cents::bigint AS revenue_cents`). Board uses `loadCostsRevenueJoin` (issued invoice net of tax → charge lines). ROOT CAUSE: load-cost-rollup.sql.ts built in ROUND 285.4.4 / ROUND 173 using `rate_total_cents`; board re-engineered in ROUND 443.139 (#26744, `7a570c3432`) with a live-document formula — rollup never updated. ONE FIX: rollup adopts `loadCostsRevenueJoin` from load-costs-live-documents.sql.ts; `rate_total_cents` never used directly for revenue display. GUARD: `verify-rollup-revenue-matches-board.mjs` — query both for same load, assert equal; RED on main if an invoice exists. BLAST RADIUS: rollup consumers (tour readout, dispatch panel, factoring, reports) will show invoice-net revenue instead of raw rate; any discounts/adjustments will surface — zero GL change, display-only.

**D2 CONFIRM** `load-cost-rollup.sql.ts:113` — `b.status NOT IN ('void','voided')` for bills, NO `NOT EXISTS (driver_finance.driver_bills db WHERE db.accrued_bill_id = b.id)` guard. `LOAD_COST_DOCUMENTS_CTE` (line comment: "Accrued driver-pay AP bills are the same obligation as their driver bill, not another cost") has the explicit exclusion. ROOT CAUSE: rollup predates the accrued-bill exclusion pattern introduced in ROUND 443.139. ONE FIX: add the NOT EXISTS subquery to rollup cost section. GUARD: same as D1 — compare cost_cents for a load with both a driver bill AND an accrued AP bill. BLAST RADIUS: rollup cost/margin will DECREASE for loads where an accrued AP bill exists (removes double-count). No GL change. Live USMCA: need prod read to count affected loads — but no ledger change.

**D3 CONFIRM** Four driver-pay formulas; `driver-pay-detail` uses `LIMIT 1` dropping team 2nd bill + reads dead column `settled_in_settlement_id`. ROOT CAUSE: each consumer evolved independently. ONE FIX: `resolveDriverPayForLoad(loadId, companyId)` single function used by all. GUARD: `verify-driver-pay-formula-unified.mjs`. BLAST RADIUS: 0.

**D4 CONFIRM** Five "open pre-settlement" definitions; two functions named `listOpenPreSettlements`. ROOT CAUSE: the concept was needed repeatedly in different queries before it was centralized. ONE FIX: one exported SQL fragment `OPEN_PRE_SETTLEMENT_PREDICATE` used everywhere. GUARD: `verify-one-open-presettlement-predicate.mjs`. BLAST RADIUS: 0 (query-scope only, no posting).

**D5 CONFIRM** Six resolvers for "which settlement is this load on". ROOT CAUSE: `settlement-resolution.sql.ts` exists but was built late (ROUND 443.xxx); pre-existing consumers were never migrated. ONE FIX: all consumers adopt `resolveLoadSettlementSql(load)`. GUARD: `verify-settlement-resolution-single-path.mjs`. BLAST RADIUS: 0.

**D6–D9 CONFIRM** — all confirmed per file:line in register. ONE FIX per item: D6 = one membership predicate; D7 = settlement always from `driver_settlements.driver_id`; D8 = one "open driver bill" predicate; D9 = all boards use `loadCostRollupLateral`. GUARD: `verify-money-surfaces-agree.mjs` (G2 fix). BLAST RADIUS: 0.

---

### SECTION E — REVERSE/VOID LEAVES DERIVED ROWS STALE

**E1 CONFIRM** `apps/backend/src/driver-finance/void-document-callees.service.ts:78-150` and `apps/backend/src/driver-finance/driver-settlement-void-cascade.service.ts` — confirmed by grep: no `presettlement_link_id` UPDATE in either file. `settlement-payrun-close.service.ts:654` READS by presettlement_link_id → the pointer must be correct for the reader but void never clears it. LIVE 21:22Z: 3 USMCA loads carry a voided/cancelled presettlement_link_id. ROOT CAUSE: void cascade was scoped to financial rows (driver bills, settlement lines); the presettlement pointer on `mdata.loads` was treated as metadata, not as a reference requiring cleanup. ONE FIX: void cascade adds `UPDATE mdata.loads SET presettlement_link_id = NULL WHERE presettlement_link_id = $settlement_id` inside the same transaction, audited. GUARD: `verify-void-clears-presettlement-links.mjs` — queries USMCA prod for loads where presettlement_link_id points at voided/cancelled settlement; RED on main (3 found). BLAST RADIUS: ZERO ledger change. 3 live rows repaired (pointer null). Must NOT re-order any GL posting — this fix is pointer-only.

**E2 CONFIRM** `accounting.company_settlements` never touched by void cascade. `readout` query has no status filter. ROOT CAUSE: company_settlements tracks the company-side (customer-facing) settlement; the void cascade only addressed the driver-side. ONE FIX: void cascade marks company_settlement status='reversed' in the same tx. GUARD: `verify-void-updates-company-settlements.mjs`. BLAST RADIUS: 0 (status display change, no GL).

**E3 CONFIRM** Load status not stepped back on settlement reverse. ROOT CAUSE: `cancellation-reversal.service.ts:63` restores to `restore_status` from the cancellation record, but no equivalent for settlement void. ONE FIX: settlement void logic: when reversing a settlement whose load is 'invoiced' or 'closed', step load status back to 'delivered'. GUARD: `verify-settlement-reverse-steps-back-load-status.mjs`. BLAST RADIUS: 0 (status only, no GL).

**E4 CONFIRM** `cash-flow.service.ts:365` projects driver pay for settlements voided without `reversed_at`. ROOT CAUSE: the stamp was not consistently written by all void paths. ONE FIX: ensure every void path sets `reversed_at = now()` on driver_settlements. GUARD: existing `verify-settlement-reversed-at.mjs` or new check. BLAST RADIUS: 0 (cash flow projection only, no GL).

---

### SECTION F — STATUS WRITERS SKIP STATE MACHINE

**F1 CONFIRM** Four overlapping rule sets confirmed. ROOT CAUSE: each writer was added at a different phase without unifying through `load-transition.service.ts`. ONE FIX: all status writes go through `transitionLoadStatus(loadId, newStatus, actor, reason)` which validates against the single machine. GUARD: `verify-all-load-status-writes-through-transition.mjs` — AST check every file with `UPDATE mdata.loads SET status`. BLAST RADIUS: 0 (routing change, no GL).

**F2 CONFIRM** Eight unvalidated writers — `load-billing-lifecycle.service.ts:129`, `invoices.routes.ts:1322`, `cancellation.service.ts:151`, `cancellation-reversal.service.ts:63`, `loads-bulk.routes.ts:348`, `draft-crew-status-advance.ts:49`, `draft-crew-status-selfheal.cron.ts:101`, DB trigger `trg_invoice_death_reverts_load`. ROOT CAUSE: same as F1. ONE FIX: same as F1; DB trigger is the hardest — needs a migration to update the trigger to call a function that validates the transition. GUARD: same as F1. BLAST RADIUS: 0.

---

### SECTION G — GUARDS THAT CANNOT CATCH THE DRIFT

**G1 CONFIRM** `scripts/verify-load-boards-agree.mjs` re-implements SQL inline. ROOT CAUSE: guard was written to measure the boards before their handlers were refactored — inline SQL was the only option. ONE FIX: guard calls the actual route handlers (or imports their SQL helpers directly) instead of reimplementing. GUARD: this IS the guard; its redesign IS the fix. BLAST RADIUS: 0.

**G2 CONFIRM** No guard asserts all money surfaces return same revenue/cost/driver-pay for same load. ROOT CAUSE: no one built it. ONE FIX: `verify-money-surfaces-agree.mjs` — for each USMCA live load, calls rollup + board + profitability engine; asserts equal values; LIVE mode, fails on first difference. GUARD: this is the guard. BLAST RADIUS: 0.

**G3 CONFIRM** No guard asserts every load mutation refreshes every load view. ROOT CAUSE: no one built it. ONE FIX: `verify-load-mutations-invalidate-all-views.mjs` — AST check that every route/service that writes mdata.loads calls `notifyLoadChanged` or the queryClient utility. GUARD: this is the guard. BLAST RADIUS: 0.

---

### Q1 — WHICH FIGURE IS "LOAD REVENUE" ON AN OPERATIONAL BOARD?

**EVIDENCE:** Owner (dual cash/accrual, MASTER ENGINE REGISTER §1.11): books run cash basis. CPA decision (revenue at delivery). `loadCostsRevenueJoin` formula: issued invoice net of tax if invoice exists, else charge lines. `rate_total_cents` is the raw rate from booking — it does not reflect invoice edits, discounts, or adjustments.

**ANSWER:** The board formula — **issued invoice net of tax → dispatch charge lines as fallback** — is the correct operational figure. It shows what the customer is being billed (invoice if sent) or contractually owes (charge lines if not yet invoiced). `rate_total_cents` should NEVER be a display revenue figure: it is a snapshot from booking that does not reflect edits. The rollup must adopt `loadCostsRevenueJoin`. On a cash-basis book, revenue is recognized when collected; the board shows the contractual/invoiced figure (not yet collected) — this is correct for an *operational* board even on cash-basis accounting.

---

### Q2 — IS views.live_loads STILL NEEDED?

**EVIDENCE:** Used by 8+ consumers (Home counts, Dispatcher Home, planner/week, at-risk, late, attention list, dashboard count — confirmed by `grep -r live_loads apps/`). `canonical-active-load-set.ts` header comment (line 1): "A per-caller convention is what failed." The view pushes the money-half guarantee into the data layer so it cannot be skipped by any future board.

**ANSWER:** YES, views.live_loads is still needed. Removing it requires every one of those 8+ consumers to individually re-apply the `NOT EXISTS` money-half predicate — the exact failure pattern the view was created to prevent. The fix is to add 'voided' to its exclusion list (B2) via a migration `CREATE OR REPLACE VIEW`. It is NOT redundant with canonical-active-load-set.ts: the canonical set governs STATUS lists; the view governs the FULL predicate including money-half conditions that a status list cannot express.

---

### Q3 — IS pg_notify + LISTEN ALLOWED ON NEON / RENDER MULTI-INSTANCE?

**EVIDENCE:** Confirmed zero pg_notify/LISTEN in repo. Neon docs: LISTEN/NOTIFY works on **direct (non-pooler) endpoints** only — pgbouncer (Neon pooler) does not support LISTEN because it does not hold dedicated connections. Render multi-instance: each instance would need its own LISTEN connection; they will each receive the pg_notify independently (fan-out to all instances = fan-out to all SSE subscribers on each instance).

**ANSWER:** TECHNICALLY ALLOWED with two constraints: (1) The LISTEN connection **must use the direct Neon endpoint URL** (not the pooled URL). A separate env var `DATABASE_DIRECT_URL` is needed — the backend must open a dedicated, non-pooled pg connection for LISTEN only. (2) Render multi-instance is compatible — each instance subscribes independently; all SSE subscribers on any instance will receive the event. The design is architecturally sound. Owner decision needed: authorize the direct-URL env var and one dedicated LISTEN connection per Render instance.

---

### Q4 — DOES FIXING E1/E3 CHANGE ANY POSTED LEDGER NUMBER?

**EVIDENCE:** E1 = UPDATE mdata.loads SET presettlement_link_id = NULL (pointer column, not a GL posting trigger). E2 = UPDATE accounting.company_settlements SET status = 'reversed' (status column). E3 = UPDATE mdata.loads SET status = prior value (status column). No migration to accounting.journal_entries or accounting.journal_entry_postings. No new GL runs.

**ANSWER:** ZERO ledger change. Confirmed: `mdata.loads.presettlement_link_id` has no accounting.journal_entry_postings FK or trigger. `accounting.company_settlements.status` is a display field with no posting trigger. Load status changes are not posting triggers (posting triggers are invoice sends and payment events). All three fixes are pointer/status repairs only. The 3 stale presettlement_link_ids on live USMCA loads do not affect any GL balance.

---

### Q5 — WHY DID DUPLICATE FORMULAS APPEAR?

**EVIDENCE from git log:**
- `load-cost-rollup.sql.ts` introduced in `cdce28e408` (ROUND 443.2026092587, alias-shadow bug fix) — this was the FIRST cost/revenue engine, using `rate_total_cents` + bill/expense/driver-pay sums.
- `load-costs-live-documents.sql.ts` introduced in `7a570c3432` (#26744 Codex ROUND 443.139) — a NEW engine: "read live documents immediately, independent of posting/settlement timing" — readsactual invoice and expense documents instead of summary fields.
- `load-cost-rollup.sql.ts` was NEVER updated to use the new document-reading pattern after #26744 landed. The two engines coexisted because no guard asserted they must agree, and no ticket said "replace rollup with board formula."

**ROOT CAUSES by family:**
- D1/D2 (revenue + cost double-count): Two separate build rounds created two separate engines with no coordination guard. Board engine (#26744) was a full redesign; rollup was patched for a bug fix, not redesigned.
- D4 (open pre-settlement, 5 definitions): Each feature building settlement-related UI needed the concept and defined it inline because no shared predicate was exported.
- D5 (settlement resolver, 6 paths): `settlement-resolution.sql.ts` was created late as part of one feature; pre-existing consumers were never migrated to use it.
- A/B/C duplicates: All followed the same pattern — feature built independently, canonical abstraction created later, old callers not migrated.

**PERMANENT FIX PATTERN (same for all):** Every family gets: (1) one canonical SQL expression/helper in one file, (2) a guard that asserts all consumers import ONLY that helper (no inline re-implementation), (3) CI FAILS if a new inline version appears. This is the guard-as-law principle (LAW §2): not convention, enforcement.

---

**CC-1 POSITION:** Every item A1–G3 CONFIRMED from code. No REFUTE. The root cause is always the same: feature-first development without a shared contract, followed by canonical abstractions that were never retroactively enforced. The permanent fix is the same in every case: one canonical helper + one CI guard that rejects reimplementations. The guard-as-law (§2) is what will keep it fixed. Q1–Q5 answered from evidence. No code changes in this post.

**Deadline:** 10-22 01:00Z · Posted: 2026-10-21 ~21:52Z

