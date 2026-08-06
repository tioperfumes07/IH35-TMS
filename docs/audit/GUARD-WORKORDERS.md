# GUARD WORK-ORDERS — the live fix board (read after AUDIT-COVERAGE-LIVE.md, before any block)

---

## ★★ PERMANENT LAW — owner-locked 2026-08-05 (supreme; applies to every agent, every session)

**1. FINDINGS FLOW AGENT → BOARD → AGENT, NEVER THROUGH THE OWNER.** Find a defect in another lane →
**WRITE an OPEN row into `docs/audit/GUARD-WORKORDERS.md` yourself and commit it**; the target coder pulls
it on their next loop. **The owner is NOT a message bus — ever, in any session.**

**2. LAW = ENFORCED GUARD, OR IT IS NOT LAW** (phased). Every NEW rule ships with a guard registered in
`docs/law/LAW.json`. `verify-law-registry.mjs` is a required check (<2s, existence-only) and fails the
build if a registered law's guard file is missing. Old rules migrate as a backlog class. Judgment rules
stay judgment.

**3. ROLES.** CC-1 = money / GL / WORM. CC-3 = mechanical / entity-scope / FE / CI-guards. CC-2 = GUARD,
**verify live, never build**. CASCADE = merger (direct merge API — auto-merge is broken on our rulesets,
community #190610).

**4. ENTITY + DATA LAW.** VOID = reversal; **nothing is deletable**. TRANSP / USMCA own **no assets
today**. **ALL TMS-native data is TEST** — only the TRANSP QBO mirror is real. **RLS is NOT a backstop for
Owner sessions**: `org.user_accessible_company_ids()` returns EVERY active company when the role is Owner,
so **every unscoped read is load-bearing on its own predicate**.

**5. EVERY LOOP.** read board → **grep-verify the card against main** → build **ONE complete atomic block**
→ found another lane's defect? **write it to the board** → push → next. Never idle, never pause to
summarize, never half-edit.


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
| Cost-line-validator (C1, P1) | — | C | Claude Coder | **CRITICAL**: the WO "at least one cost line" validator ignores Section-A category lines (same field mismatch as bill-validator). A WO with only category cost lines appears empty to the validator. Separate from #4048 — client-side defect. Must be fixed AFTER #4062 pattern. | — | **CLOSED 2026-08-05 (CC-3 reconcile)** — fix is ON MAIN since `99900efaa` (2026-08-02): the validator counts `sectionALines.length + sectionBLines.length`, not the edit-only `line_items`. Guard `scripts/verify-wo-cost-line-validator.mjs` wired as verify-step **2017**, exit 0. Card was 3 days stale. |
| Manual-invoice-no-post (`CLS-SUBLEDGER-GL-DARK`) | — | C | Claude Coder | Invoice creation (`POST /invoices`, `POST /invoices/from-load`) and send (`/:id/send`) NEVER call the posting engine. 1 of 11,977 invoices ($40.7M) posted; 0 of 3,195 bills ($26.7M); 0 of 12,123 payments ($39.9M). Poster works (USMCA's 1 bill posted correctly); nothing in live flow calls it. Fix: wire `postSourceTransaction` into the create/send path OR schedule the backfill on cron. HIGHEST-DOLLAR FINDING. | — | **OPEN (P0) — architectural decision needed** |
| WF064-consumer dead (P1) | — | C | Claude Coder | `dispatch.wf064.distribution_failure` outbox handler (`dispatch-load-dispatched.handler.ts:63`) references a settlement-distribution consumer that is disconnected. Escrow-deduction-pending WF064 lifecycle (`wf064_requested_at`, `wf064_reminder_7d_at`) writes columns but no consumer reads them downstream to trigger the actual deduction run. The settlement cycle never fires. | — | **OPEN (P1) — needs architecture review** |
| Class-UUID renders in picker (D) | 601 | D | Claude Coder | QBO Class picker (`classId` field on expenses/invoices) renders raw UUID strings instead of human-readable class names. Mapping from `mdata.qbo_classes` (172 TRANSP rows) to display name not wired in the combobox option renderer. User sees `"a1b2c3d4-..."` instead of `"Fuel"`. | — | **CARD WAS WRONG + FIXED 2026-08-05 (CC-3)** — the pickers were already correct (`VendorBillForm` maps `display_name||code`; `ManualJEModal` maps `class_code - class_name`) and the truth source is `catalogs.classes`, NOT the `mdata.qbo_*` mirror. The REAL defect was on the GL posting detail: Account+Class fell back to raw uuids, resolved through entity-unscoped joins. Fixed in **#4530**. |
| WF064 override-notice produced, consumed nowhere | 610 | C | Claude Coder | `dispatch.wf064.override_notice` emitted ×3 (confirmed on Neon), but no handler/consumer exists for this event type. Owner override fires silently with no notification delivery. P1. | — | **CLOSED 2026-08-05 (CC-3 reconcile)** — `DispatchOverrideNoticeHandler` exists and IS registered in `outbox/handlers/registry.ts:104` on main. Guard `scripts/verify-wf064-override-notice-consumer.mjs` wired as verify-step **2019**, exit 0. |
| Maintenance class auto-derive renders UUIDs | 611 | E | Claude Coder | WO class auto-derive displays `{unit_uuid}-{driver_uuid}` instead of `{UNIT_NUMBER}-{DRIVER_LAST_NAME}`. P2. | — | **CARD PARTLY STALE + FIXED 2026-08-05 (CC-3)** — the uuid-rendering half was already fixed and tested (`deriveWoClassHintLabel` rejects uuid-shaped segments). The live remainder was one line below it: the driver surname was read with NO entity predicate, so a WO could derive its Class from another entity's driver. Fixed in **#4529**. |
| Invoice-no-post USMCA (same CLS-SUBLEDGER-GL-DARK) | 608 | C | Claude Coder | Manual invoice creates draft, posts no JE. Fix = call poster on Finalize/Post or Send. Same architecture as row 598 / TRANSP $107M finding. | — | **OPEN** |
| Book Load inline "+Add customer" native-GET | 113 | D | Claude Coder | Surgical: un-nest the 4 drawer `<form>`s → `type=button` + `onClick`; restore Enter via `onKeyDown`; class guard. Do NOT bundle the ParityDrawer portal (separate audited PR) | FIX 2 | in flight |
| Driver default drift | (FIX 1) | — | Claude Coder | Keep Probation default; change BACKEND default to Probation (match UI); show "not assignable — Probation" reason in picker + detail; do not touch the Active gate | pending build | approved |
| USMCA `damage_recovery` → COGS-5400 repoint | 11 | C | Claude Coder | Create USMCA "Driver Accident Damages & Repairs" contra account; repoint off 5400; NOT the inactive Income acct | Task 3 | owner-gate → building |
| USMCA chart gaps (fuel/tolls/lumper/pay/escrow, 42xx revenue) | — | C | Claude Coder | Mirror TRANSP by purpose; entity-scoped (never FK a TRANSP acct); 4210/4220/4230/4240 + 6 revenue maps 1:1; fix NULL account_number on USMCA Insurance Expense | Task 3 | building |
| Bills `mdata_vendor_id` NULL ×2 | 3 | C | Claude Coder | Backfill the 2 remaining to canonical vendor hub; additive | — | OPEN |
| **OPEN** `home-widgets` auth status-code | — | C | whoever owns home-widgets auth | `apps/backend/src/home/home-widgets.routes.test.ts > "rejects Driver callers"` FAILS: **expected 403, got 401**. A Driver caller is treated as UNAUTHENTICATED rather than AUTHENTICATED-BUT-FORBIDDEN — the test asserts that distinction and the route no longer honours it. **PRE-EXISTING, NOT introduced by CC-3** — verified 2026-08-05 by running that single test against `origin/main` with all local changes stashed: it fails identically there. Surfaced while shipping LV-115 (#4535); recorded so it is tracked rather than silently carried in every subsequent PR's test output. | — | **OPEN** |
| **FIXED** `ACCT-F130` — customer-payment path cross-entity reads | — | C | CC-3 | Three reads resolved rows by id with NO entity predicate while their DRIVING row was correctly scoped. (a) `payment-applications.routes.ts` post-application read-backs of `payments.amount_unapplied_cents` and `invoices.amount_open_cents/status` — these are written **into the CRUD AUDIT record** as the post-application balances, so a matching id from another company recorded THAT entity's balance as this application's outcome. (b) `customer-payments.routes.ts` LATERAL `JOIN accounting.invoices` supplying **`invoice_display_id`** — display_id is unique PER ENTITY, not globally (`INV-2026-00004` exists on USMCA $0 **and** TRANSP PAID $3,800, verified live), so it could stamp another entity's invoice number onto a payment application. All three now scoped to the payment's own company. Belongs to **CLS-JOIN-ENTITY-UNSCOPED** (owner-role-RLS shape — `org.user_accessible_company_ids()` returns EVERY company for Owner, so RLS is not a backstop). **38 accounting offenders REMAIN in the baseline — this is 3; the class is NOT drained.** | **#4536** | **FIXED — awaiting GUARD live verify** |
| **OPEN** `collections.routes` test harness | — | C | whoever owns collections routes | `apps/backend/src/accounting/__tests__/collections.routes.test.ts` fails **4 of 5** (list query contract, company-filter pass-through, 404-in-company-scope). **PRE-EXISTING, NOT introduced by CC-3** — verified 2026-08-05 by running it against `origin/main` with all local changes stashed: identical 4 failed / 1 passed. Surfaced while shipping #4536; recorded so it is owned rather than scrolled past in every PR's test output. | — | **OPEN** |
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
