# GUARD WORK-ORDERS — the live fix board (read after AUDIT-COVERAGE-LIVE.md, before any block)

**Maintained by GUARD. Purpose: no coder idles.** `AUDIT-COVERAGE-LIVE.md` says WHAT is broken (finding +
live evidence). This board says WHO owns it, the FIX REQUIREMENT + the standard it must meet, and the GUARD
status. Pull the top `OPEN` item in your lane and start — do not wait to be told, do not re-audit a row that
already has an owner here.

## How to use this board

1. Read `docs/audit/AUDIT-COVERAGE-LIVE.md` (the findings) + this file (the assignments + requirements).
2. Take the highest `OPEN` item in **your lane** below.
3. Build to the **Fix requirement** + the cited standard. Author the compliant block (18 git-gate keys, DoD/
   VERIFY, guard with `--selftest`, linkage declaration) — CI enforces it.
4. **Apply on Neon yourself** (you have access; the owner does not hand-run Neon) after the gates pass.
5. Set the audit row `Status = FIXED (PR #nnnn)`. Post the merge sha here + to GUARD.
6. **GUARD verifies** in git (file+line on main, guard wired, deploy sha) + on Neon (posting balanced, linkage
   both-ways, positive control) and flips the row to `VERIFIED`. A coder `FIXED` is a claim until then.

## Lanes

- **CLAUDE CODER** — financial cluster: `accounting.*`/`catalogs.accounts`, migrations, posting/GL, role
  designations, the USMCA chart, the seed battery.
- **CURSOR** — frontend/UI, measurability, docs, non-financial backend, catalog seeds, KPI/parity fixes.
- **CASCADE** — audit writer: finish the Layer-C sweep, re-test the UNVERIFIED D/E rows, design-bar pass.

---

## LIVE BOARD (GUARD updates as shas land)

| Item | Audit row | Layer | Owner | Fix requirement (+ standard) | Block/PR | GUARD status |
|---|---|---|---|---|---|---|
| Fleet KPI parity | 114 | A | Cursor | Shared visibility helper; roster + KPI same predicate; parity guard | #4016 `575aee6eaf` | **VERIFIED** |
| Recovery/parts/fines accounts + 4 designations | — | C | Claude Coder | Contra-expense/never-income (warranty+insurance, ASC 450 cap-at-loss); parts separate from R&M; fines non-deductible; entity-scoped | #4015 `d49918608d` | **VERIFIED** |
| Expense posting — record-expense calls poster | — | C | Claude Coder | `RecordExpense` path now fires `postSourceTransaction` after save. Balanced JE created on first manual expense. GUARD live-confirmed on Neon: posted_at NOT NULL, DR expense / CR bank. | #3947 (merged) | **GUARD-VERIFIED** |
| Owner-override keystroke fix | — | D | Claude Coder | The override reason textarea could not take a keystroke (nested `<form>` swallowed it). Fixed: uncontrolled textarea, owner can type, reason persists. | #4036 (merged) | **GUARD-VERIFIED** |
| Owner-override audit log + role pin | — | D | Claude Coder | Override tied to its dispatch, role helper pinned, Owner-Override Log added. Completes the override lifecycle. | #4041 | **OPEN — pending GUARD verification** |
| Picker-scope: expense paid FROM Accumulated Depreciation | — | A/D | Claude Coder | Payment-account picker offered ALL Asset-type accounts (incl. Accum Depr, Trucks, Prepaid, A/R, Intercompany). Fix: shared `account-picker-scope.ts` helper, Bank/CreditCard + cash-like only. Cost-line picker (WO) scoped identically. ACCT-F92. GUARD to confirm live picker no longer offers non-spendable accounts. | #4053 | **OPEN — code landed, awaiting GUARD browser re-check** |
| Bill-validator: category line could NEVER save | — | C | Claude Coder | `VendorBillForm` validated `line.account_id` (never assigned by builder) instead of `line.expense_category_uuid` (the field the grid writes). Every Section-A category line unconditionally failed. Fix: validate `expense_category_uuid`. ACCT-F93. | #4062 | **OPEN — code landed, awaiting GUARD verification** |
| WO-vendor: USMCA vendor WO always failed | — | C | Claude Coder | Route validated vendor against `mdata.qbo_vendors` (mirror, empty by design for non-QBO entities). Fix: repoint FK + route to canonical `mdata.vendors`. Migration 202611170000. ACCT-F91. | #4048 | **OPEN — code landed, awaiting GUARD browser re-check (USMCA Repair WO + bill)** |
| Cost-line-validator (C1, P1) | — | C | Claude Coder | **CRITICAL**: the WO "at least one cost line" validator ignores Section-A category lines (same field mismatch as bill-validator). A WO with only category cost lines appears empty to the validator. Separate from #4048 — client-side defect. Must be fixed AFTER #4062 pattern. | — | **OPEN (P1) — no PR yet** |
| Manual-invoice-no-post (`CLS-SUBLEDGER-GL-DARK`) | — | C | Claude Coder | Invoice creation (`POST /invoices`, `POST /invoices/from-load`) and send (`/:id/send`) NEVER call the posting engine. 1 of 11,977 invoices ($40.7M) posted; 0 of 3,195 bills ($26.7M); 0 of 12,123 payments ($39.9M). Poster works (USMCA's 1 bill posted correctly); nothing in live flow calls it. Fix: wire `postSourceTransaction` into the create/send path OR schedule the backfill on cron. HIGHEST-DOLLAR FINDING. | — | **OPEN (P0) — architectural decision needed** |
| **Scenario-tracker entity-code contract (LV-115)** | — | D | **CC-3 / mechanical+route** | **API-CONTRACT type mismatch, NOT an RLS/FK/enum bug.** `GET /api/v1/home/scenario-tracker` parses `entity` as `$2::uuid`; the Program tracker sends the entity **CODE** (`?entity=USMCA`). A code casts to no uuid, the read falls back to **ALL**, and the API returns **HTTP 200** with a plausible board — no 400, no error, no empty state. **Live on deploy `dc85375` (re-verified, not from memory):** `?entity=TRANSP`, `?entity=USMCA`, `?entity=TRK` ALL return `entity_scope:"ALL"` with `hop.gl = 1766`; the UUIDs return correctly (TRANSP 1747, USMCA 13, TRK 6) and **1747+13+6 = 1766** — every entity button renders the three-entity SUM. **Affects all 3 entities** (every scope button is inert). **CROSS-ENTITY in effect, but NOT a separation/RLS breach:** the DB scoping is correct and nothing bypasses RLS — the caller simply never asks for a scope, so ALL is served legitimately. It is a *misattribution* bug (one entity's label over three entities' numbers), not a leak of data the caller couldn't otherwise read. Ranks with JOIN-ENTITY on **impact**, differs on **mechanism** (unscoped SQL join vs wrong identifier type from the caller). **NOT money lane** — no GL/posting write path is touched; it is a read/display contract. **Note:** ACCT-F120 already fixed the SQL predicate correctly and is deployed — this is the layer above it, which is why the fix landed and the symptom survived. **FIX:** send the UUID (or resolve code→id in the route) **AND** make the route reject a non-UUID `entity` with **400** instead of silently becoming ALL. **GUARD:** assert an unknown/code-shaped `entity` does NOT return `entity_scope:"ALL"` — a guard over the SQL predicate alone reproduces this exact miss. | — | **OPEN (major) — GUARD-measured, awaiting build** |
| WF064-consumer dead (P1) | — | C | Claude Coder | `dispatch.wf064.distribution_failure` outbox handler (`dispatch-load-dispatched.handler.ts:63`) references a settlement-distribution consumer that is disconnected. **CORRECTED by GUARD 2026-08-05 (LV-120): the lifecycle never runs at all — the columns are not "written with no reader", they have never been written.** Prod: `escrow_deductions_pending` **0 rows / `n_tup_ins` = 0**; **0** of 31,646 outbox events match `dispatch.*`/`%wf064%`. "The settlement cycle never fires" is correct, but the cause is upstream of the consumer — nothing produces. Fixing a consumer would change nothing observable. Pair with row 610. | — | **OPEN (P1) — re-scoped: producer never fires, not a dead consumer** |
| Class-UUID renders in picker (D) | 601 | D | Claude Coder | QBO Class picker (`classId` field on expenses/invoices) renders raw UUID strings instead of human-readable class names. Mapping from `mdata.qbo_classes` (172 TRANSP rows) to display name not wired in the combobox option renderer. User sees `"a1b2c3d4-..."` instead of `"Fuel"`. | — | **OPEN — Cursor or Claude** |
| WF064 override-notice produced, consumed nowhere | 610 | C | Claude Coder | ~~`dispatch.wf064.override_notice` emitted ×3 (confirmed on Neon), but no handler/consumer exists~~ **CORRECTED by GUARD 2026-08-05 (LV-120): the producer has never fired either.** Live on prod: `outbox.events` holds **31,646** rows across **9** event types (31,598 = `qbo.sync.failed`) and **ZERO** match `dispatch.*` or `%wf064%`. `driver_finance.escrow_deductions_pending` is **0 rows / `n_tup_ins` = 0** — never one row inserted, though both `wf064_requested_at` / `wf064_reminder_7d_at` columns exist. So nothing is being dropped by a missing consumer: **the whole WF064 lifecycle is inert end-to-end** — wired, never executed (same shape as the abandonment chain, LV-114). Re-scope before any coder time: this is "never run", not "consumer disconnected". Caveat: outbox rows can be purged post-processing, so 0-now is not proof they never existed — but `n_tup_ins=0` on the deduction table IS conclusive that no deduction ever landed. | — | **OPEN — re-scoped, needs owner/architecture decision (not a consumer bug)** |
| Maintenance class auto-derive renders UUIDs | 611 | E | Claude Coder | WO class auto-derive displays `{unit_uuid}-{driver_uuid}` instead of `{UNIT_NUMBER}-{DRIVER_LAST_NAME}`. P2. | — | **OPEN** |
| Invoice-no-post USMCA (same CLS-SUBLEDGER-GL-DARK) | 608 | C | Claude Coder | Manual invoice creates draft, posts no JE. Fix = call poster on Finalize/Post or Send. Same architecture as row 598 / TRANSP $107M finding. | — | **OPEN** |
| Book Load inline "+Add customer" native-GET | 113 | D | Claude Coder | Surgical: un-nest the 4 drawer `<form>`s → `type=button` + `onClick`; restore Enter via `onKeyDown`; class guard. Do NOT bundle the ParityDrawer portal (separate audited PR) | FIX 2 | in flight |
| Driver default drift | (FIX 1) | — | Claude Coder | Keep Probation default; change BACKEND default to Probation (match UI); show "not assignable — Probation" reason in picker + detail; do not touch the Active gate | pending build | approved |
| USMCA `damage_recovery` → COGS-5400 repoint | 11 | C | Claude Coder | Create USMCA "Driver Accident Damages & Repairs" contra account; repoint off 5400; NOT the inactive Income acct | Task 3 | owner-gate → building |
| USMCA chart gaps (fuel/tolls/lumper/pay/escrow, 42xx revenue) | — | C | Claude Coder | Mirror TRANSP by purpose; entity-scoped (never FK a TRANSP acct); 4210/4220/4230/4240 + 6 revenue maps 1:1; fix NULL account_number on USMCA Insurance Expense | Task 3 | building |
| Bills `mdata_vendor_id` NULL ×2 | 3 | C | Claude Coder | Backfill the 2 remaining to canonical vendor hub; additive | — | OPEN |
| Fuel GL-dark / `load_id` NULL 1,547 | 1, 122; 599→**673** | B/C | Claude Coder | `load_id` NULL (G18) remains OPEN on rows 1/122. **GL-dark + CLS-FUEL-DOUBLE-POST:** SUPERSEDED by row 673 — fuel batches 1547/1547; $47.7K was scope mismatch (not double-post). Real residual ~$4,594 tires/tolls → `CLS-CATEGORY-MAP-COHERENCE` (Claude money). | — | OPEN (linkage only; double-post drained) |
| Banking all-accounts aggregate | 2 | E | Cursor | Reproduce the surface + filter that must equal per-account sum; fix the aggregate view | #4011 + #4028 `15018936b` residual no double-/100 | **FIXED** — KPI dollars match tile sum; guards 1508/1973/2012 — await GUARD VERIFIED |
| Inventory category picker empty | 25 | D | Cursor | SelectCombobox over PART_INVENTORY_CATEGORIES + backfill location→category | #4029 `944e7aa46` · Neon apply 202611161200 @ 20:07Z · cat_null 0/144 | **FIXED** — await GUARD VERIFIED |
| ParityTable resize hit-target | 57 / 224 | A/E | Cursor | Discoverable resize affordance (grip visible at rest) | #4027 `6500c1d16` · step 2008 | **FIXED** — await GUARD VERIFIED |
| Settlements + Users → ParityTable resize | 206–207 | A | Cursor | Primary lists use ParityTable enableColumnResize + URL sort | #4030 `a381c8ed5` · step 2010 | **FIXED** — await GUARD VERIFIED |
| 7 pickers "D CODE-VERIFIED" | 19–23,26,55 | D | GUARD live exercise | EXERCISE the inline +Create live (fill→save→persist, no native GET); after FIX 2. Code-wired ≠ verified (see §2-D note). **Test list:** `docs/audit/GUARD-DE-TEST-LIST.md` §D — exact surface, picker, canonical table, PASS criteria per row. | — | UNVERIFIED |
| 28 E design-bar CODE-VERIFIED | 27–54 | E | GUARD live exercise | Interactive per module: resize works+discoverable, proportions, QBO filters, box-in-box, drawer-on-drawer; per entity. **Test list:** `docs/audit/GUARD-DE-TEST-LIST.md` §E — resize/filter/proportion test per module. | — | UNVERIFIED |
| 11 modules UNVERIFIABLE-until-data | (C rows) | C | seed → GUARD | Become real PASS/FAIL once the seed battery posts transactions; GUARD verifies each JE | — | UNVERIFIED |

---

## §2-D NOTE (do not let this class come back)

The Layer-D test is the **inline +Create inside a picker/wizard** — it must be **exercised** (click, fill, save,
confirm the row persists to the canonical table and appears selected, with NO native GET). It is NOT satisfied by:

- "the code is wired to POST" — the Book Load customer create *was* wired to `createCustomer()`, but a nested
  `<form>` HTML5-drop meant the POST never fired. Code inspection is the exact false signal.
- a `created_at` row from a **module-level** create modal — that proves the module create works, not the
  inline-picker create. They are different code paths (the module modal is not inside a wizard `<form>`).

Until an inline +Create is actually exercised and confirmed to persist, its row is `UNVERIFIED`, never `PASS`.

## The gate

Only **GUARD** writes `VERIFIED`, after independent live re-check (git for code, Neon for data, the app for UI).
Governed by `docs/audit/AUDIT-LAW-PERMANENT.md` (order C→B→A→D→E; a screenshot is not a Layer-E pass; "complete"
= 30/30 certified only).
