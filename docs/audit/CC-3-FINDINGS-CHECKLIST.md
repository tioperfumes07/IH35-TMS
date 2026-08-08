# CC-3 FINDINGS REGISTER & COMPLETION CHECKLIST

> **★★★ HARD STANDING RULE — OWNER-LOCKED 2026-08-07. PERMANENT. ENFORCEABLE. APPLIES TO EVERY LANE.**
>
> Owner directive, verbatim: *"I need you to create permanent rule that you will write all findings, create
> list and checklist and each coder that works on it checks it once its done so I can also request your list
> and you show it to me and I know the jobs were completed."*

**THIS FILE IS THE SINGLE PLACE THE OWNER LOOKS TO SEE WHAT IS DONE.** It is the completion register for
every defect CC-3 files. `GUARD-WORKORDERS.md` holds the evidence and the fix instructions; **this file
holds the sign-off.**


> **★★★ PERMANENT RULE — OWNER-RESTATED 2026-08-07: "you need to add everything to the shared file… that is a
> permanent rule."** EVERY finding, EVERY verification run, EVERY PASS and EVERY FAIL, and every task CC-3
> executes goes into THIS file **and** `docs/audit/GUARD-WORKORDERS.md`, on the same commit that produces it —
> not at the end of a session, not "when it's tidy". **A result that exists only in a chat reply, a battery
> note, or a PR body is NOT filed.** This file is what the owner reads to know what was done; if it is behind,
> the owner is being told less than CC-3 knows. Applies to non-defects too: a PASS that is not written down
> gets re-investigated by the next agent.

---

## THE RULE (four clauses — none optional)

**1. CC-3 WRITES EVERY FINDING HERE.** Every defect CC-3 verifies live is written to
`docs/audit/GUARD-WORKORDERS.md` (evidence + named coder + permanent-fix definition of done) **and** added
as a row in this register on the same commit. A finding that exists only in a chat message, a PR body, or
CC-3's battery notes **is not filed**.

**2. THE CODER WHO FIXES IT SIGNS IT OFF HERE — the coder, never CC-3.** When the fix is merged, the lane
that fixed it edits **its own row**: flip `☐` to `☑` and fill **Coder · PR · Date · Live proof**. CC-3
**must not** tick another lane's box; the verifier signing off its own findings destroys maker≠checker and
makes this register worthless. CC-3's only write to a completed row is an independent **VERIFIED** stamp
(clause 4).

**3. A BOX IS ONLY TICKED WHEN ALL FOUR PERMANENT-FIX CONDITIONS HOLD** (`docs/law/NEVER-GUESS-NEVER-DEFER-ALWAYS-VERIFY-ALWAYS-FIX.md` §4):
root cause corrected at source · a CI guard that FAILS on the bug and PASSES on the fix, **wired** so it
actually runs · **live proof on prod** (CI-green is the floor; merged is not done; deployed is not done
until the health SHA matches and behaviour is observed) · the class addressed elsewhere.
**Ticking a box without live proof is a false statement of completion** and is treated as the
`fake-green` violation under the hardline rule.

**4. CC-3 RE-VERIFIES INDEPENDENTLY BEFORE `VERIFIED`.** A ticked box is the coder's claim. CC-3 re-tests it
live and stamps `VERIFIED ✓` with its own evidence, or **reopens the row** with what still fails. A row is
only truly closed when both the coder's ☑ and CC-3's VERIFIED are present.

**ON DEMAND:** when the owner asks for "the list", this file is the answer — no assembly required.

---

## SCOREBOARD

| metric | count |
|---|---|
| **total findings filed** | **90** |
| **OPEN — awaiting a coder** | **80** |
| **☑ fixed & signed off by a coder** | **2** (`LV-USMCA-ACTIVE-DRIVERS-HAVE-NO-PAY-RATE` — owner-assigned to CC-3 and executed by CC-3, so maker=checker here BY OWNER INSTRUCTION; every other row still awaits its lane) |
| **VERIFIED ✓ by CC-3 (independently re-tested)** | **2** (`CLS-MONEY-WORM-GAP` 99.6% · `LV-ESCROW-SUBLEDGER-NOT-WORM` partial — both still OPEN pending coder sign-off) |
| **created-txn registration runs** | **5** — 2 PASS, **1 FAIL (P0)**, 1 owner task DONE+VERIFIED; see the verify section below |
| closed / withdrawn / superseded by CC-3 | 8 |

**Still zero coder sign-offs — and that is the honest number.** On 2026-08-07 CC-1 DID fix a CC-3 finding (`ACCT-F160`, which drained `CLS-MONEY-WORM-GAP` by 99.6% and is verified live below), but **no lane has ticked its own box yet**, so the ☑ column stays 0. CC-3 will not tick another lane's box (clause 2). This register starts the
clock; every row below is waiting on the named lane.

---

## HOW A CODER SIGNS OFF (copy this into your row)

```
| ☑ | `LV-EXAMPLE-ID` | P0 | CC-1 | CC-1 | #1234 | 2026-08-09 | healthz sha abc1234 + row count 3→0 | verify-example.mjs (step 2705) |
```

Leave `☐` untouched if any of the four conditions is unmet. **A partially-fixed defect stays OPEN** — there
is no "in progress" state, because a half-fix in production is indistinguishable from no fix.

---

## OPEN FINDINGS — awaiting the named lane

| ☐ | Finding ID | Sev | Owning lane | Coder | PR | Date | Live proof of fix | Guard (file + step #) | CC-3 VERIFIED |
|---|---|---|---|---|---|---|---|---|---|
| ☐ | `LV-TXN-002` | — | CC-2 / mechanical+routes+FE | — | — | — | — | — | — |
| ☐ | `LV-TXN-004` | P0 | CC-1 (money) | — | — | — | — | — | — |
| ☐ | `LV-TXN-005` | — | CC-2 / mechanical+FE+route contract | — | — | — | — | — | — |
| ☐ | `LV-TXN-007` | P0 | CC-1 (money) | — | — | — | — | — | — |
| ☐ | `LV-TXN-009` | — | CC-1 (money) | — | — | — | — | — | — |
| ☐ | `LV-TXN-008` | — | — | — | — | — | — | — | — |
| ☐ | `LV-TXN-010` | — | CC-1 | — | — | — | — | — | — |
| ☐ | `LV-TXN-011` | — | — | — | — | — | — | — | — |
| ☐ | `LV-TXN-012` | — | CC-1 (money) | — | — | — | — | — | — |
| ☐ | `LV-TXN-013` | — | CC-1 (money) | — | — | — | — | — | — |
| ☐ | `LV-TXN-014` | P0 | CC-1 (schema/RLS) | — | — | — | — | — | — |
| ☐ | `LV-TXN-015` | P0 | CC-1 (money) | — | — | — | — | — | — |
| ☐ | `LV-TXN-016` | P0 | CC-1 (schema/RLS) | — | — | — | — | — | — |
| ☐ | `LV-TXN-017` | — | CC-2 / mechanical+routes+validation | — | — | — | — | — | — |
| ☐ | `LV-TXN-018` | P0 | CC-1 (money) | — | — | — | — | — | — |
| ☐ | `LV-PAY-SETTLE-NOPOST` | — | CC-1 / money | — | — | — | — | — | — |
| ☐ | `LV-AP-OPEN-INCLUDES-VOIDED` | — | CC-1 / money | — | — | — | — | — | — |
| ☐ | `LV-BILLS-VENDOR-UUID` | — | CC-2 / mechanical+FE | — | — | — | — | — | — |
| ☐ | `LV-REVREC-NOT-FIRING` | — | CC-1 / money — URGENT | — | — | — | — | — | — |
| ☐ | `LV-BILLVOID-DATE-ERROR` | — | CC-1 / money — URGENT, blocks the void path | — | — | — | — | — | — |
| ☐ | `LV-VOID-NO-REVERSAL` | — | CC-1 / money — URGENT | — | — | — | — | — | — |
| ☐ | `LV-CREDITMEMO-NOPATH` | — | CC-2 / mechanical+route (CC-1 confirms posti | — | — | — | — | — | — |
| ☐ | `LV-BLOCKACCEPT-RED-ON-MAIN` | — | CC-2 / mechanical + whoever owns those 3 blo | — | — | — | — | — | — |
| ☐ | `LV-EXP-NOLOAD` | — | CC-2 / mechanical+FE | — | — | — | — | — | — |
| ☐ | `LV-CI-DEPENDABOT-RED` | — | CC-2 / mechanical + CI | — | — | — | — | — | — |
| ☐ | `LV-BANKFLAG-STALE` | — | CC-1 / money | — | — | — | — | — | — |
| ☐ | `LV-SPAWN-LIABILITY-NOSAVE` | — | — | — | — | — | — | — | — |
| ☐ | `LV-WO-NOSAVE` | — | — | — | — | — | — | — | — |
| ☐ | `LV-SEND-NOREASON` | — | — | — | — | — | — | — | — |
| ☐ | `LV-INV-UUID` | — | — | — | — | — | — | — | — |
| ☐ | `LV-LOAD-EDIT-BLANK` | — | — | — | — | — | — | — | — |
| ☐ | `LV-STOPS-NOSAVE` | — | — | — | — | — | — | — | — |
| ☐ | `LV-LOAD-UNASSIGNED` | — | — | — | — | — | — | — | — |
| ☐ | `LV-OUTBOX-ERRCOL` | — | — | — | — | — | — | — | — |
| ☐ | `LV-DRV-TAB` | — | — | — | — | — | — | — | — |
| ☐ | `LV-AP-DUP` | — | CC-1 / money | — | — | — | — | — | — |
| ☐ | `LV-CAT-500` | — | — | — | — | — | — | — | — |
| ☐ | `LV-BULK-DELIVER-NOLATCH` | — | CC-1 / money (fix) + CC-2 / guard | — | — | — | — | — | — |
| ☐ | `LV-STOP-ZIP-DROPPED` | — | CC-2 / mechanical | — | — | — | — | — | — |
| ☐ | `LV-DISPATCH-TOAST-LIES` | — | CC-2 / mechanical | — | — | — | — | — | — |
| ☐ | `LV-LOAD-DETAIL-SHOWS-UNASSIGNED` | — | CC-2 / mechanical | — | — | — | — | — | — |
| ☐ | `LV-CANCEL-VOIDS-STATUS-ONLY` | — | CC-1 / money | — | — | — | — | — | — |
| ☐ | `LV-AR-OPEN-INCLUDES-VOIDED` | — | CC-1 / money | — | — | — | — | — | — |
| ☐ | `LV-BILL-NO-DISPLAY-ID` | — | CC-1 / money | — | — | — | — | — | — |
| ☐ | `LV-VOID-INVARIANT-BOTH-WAYS` | — | CC-1 / money | — | — | — | — | — | — |
| ☐ | `LV-PAYABLE-SELECTOR-OFFERS-VOIDED-BILLS` | — | CC-1 / money — HIGH | — | — | — | — | — | — |
| ☐ | `LV-BILLPAY-VOID-NO-REVERSAL` | — | CC-1 / money — HIGH | — | — | — | — | — | — |
| ☐ | `LV-VOID-LINKAGE-MISSING` | — | CC-1 / money | — | — | — | — | — | — |
| ☐ | `LV-EXPENSE-VOID-UNREACHABLE` | — | CC-2 / mechanical (FE) + a design answer fro | — | — | — | — | — | — |
| ☐ | `LV-BANK-TWO-SIGN-CONVENTIONS` | — | CC-1 / money (recon + banking) | — | — | — | — | — | — |
| ☐ | `LV-BANK-BANNER-SAYS-FLAG-OFF` | — | CC-2 / mechanical (FE copy) — flag to CC-1 ( | — | — | — | — | — | — |
| ☐ | `LV-TRK-AP-SPLIT-ACROSS-TWO-ACTIVE-ACCOUNTS` | — | CC-1 / money | — | — | — | — | — | — |
| ☐ | `LV-WO-PARTPANEL-BEHIND-MODAL-DESTROYS-FORM` | — | mechanical / FE lane (CC-3 role per board §3 | — | — | — | — | — | — |
| ☐ | `LV-WO-CREATE-500-OPENED-AT` | P0 | mechanical / backend lane — ROUTING CONFLICT | — | — | — | — | — | — |
| ☐ | `LV-WO-RECONCILE-EXCLUDES-SECTION-A` | P0 | CC-1 (money / GL / A-P) | — | — | — | — | — | — |
| ☐ | `CI-CC3-HAS-NO-VERIFY-STEP-BAND` | — | owner / lane-allocation decision (NOT self-a | — | — | — | — | — | — |
| ☐ | `CI-CODEQL-BASELINE-STALE-ON-MAIN` | — | — | — | — | — | — | — | — |
| ☐ | `LV-EXPENSE-CATEGORY-PICKER-EMPTY` | P1 | FE / mechanical lane | — | — | — | — | — | — |
| ☐ | `LV-REVREC-BULK-LATCH-GUARD-READY` | P0 | CC-1 (money / revenue latch) | — | — | — | — | — | — |
| ☐ | `LV-AUDIT-TRAIL-HAS-NO-ACTOR` | P0 | CC-1 (WORM / audit integrity) | CC-1 | #4753 | 2026-08-07 | Rehearsed on Neon fork `br-soft-pine-akr8xlf4` of prod: PRE-FIX drivers UPDATE actor/role NULL; POST-FIX drivers AND accounting.invoices both name `d62f82f6…` / `Administrator`. One SECURITY DEFINER function behind 39 triggers, so all 39 audited tables are attributed at once. | `apps/backend/src/accounting/__tests__/worm-audit-actor-attribution.db.test.ts` (db-test; runs in the backend db.tests step) | — |
| ☐ | `LV-EXPENSE-CATEGORY-PICKER-EMPTY-RC` | P1 | FE / mechanical | — | — | — | — | — | — |
| ☐ | `LV-BANKING-QBO-CONNECTED-IS-HARDCODED` | P1 | FE / mechanical (render); CC-1 to sanity-che | — | — | — | — | — | — |
| ☐ | `LV-BANK-MATCH-SCORE-SATURATES-TO-MEMO` | P1 | CC-1 (money / bank reconciliation) | — | — | — | — | — | — |
| ☐ | `CI-CC3-GUARDS-NEED-A-BANDED-ADOPTER` | P1 | CC-1 or CC-2 — EITHER may take this; whoever | — | — | — | — | — | — |
| ☐ | `LV-BANK-CATEGORIZE-POSTS-GL-WHILE-BANNER-SAYS-IT-DOES-NOT` | P0 | CC-1 (money / GL) + FE | — | — | — | — | — | — |
| ☐ | `LV-BANK-CATEGORIZE-REVERSE-LINK-IS-A-MEMO-STRING` | P2 | CC-1 (ledger linkage) | — | — | — | — | — | — |
| ☐ | `LV-MONEY-TABLES-HAVE-NO-AUDIT-TRIGGER` | P0 | CC-1 (WORM / audit integrity) | — | — | — | — | — | — |
| ☑ | `LV-ACCT-F158-NOT-IN-REPO` | **P0 — RESOLVED** | CC-1 | — | — | — | — | — | **CC-3 filed 2026-08-07** — ACCT-F158 declared closed on the board, but PR #4691 is `CLOSED`/`merged=null`; the FK is live on prod yet ABSENT from `db/migrations/` and from BOTH ledgers, and the service fail-open is still on `main`. A fresh DB gets no protection. **RESOLVED + CC-3 RE-VERIFIED 2026-08-07:** migration now ON `origin/main`, **applied and recorded** in `ih35_migrations.applied_migrations` @19:08:37Z, FK live and `convalidated`. A fresh DB now gets the control. `LV-BILL-MDATA-VENDOR-FK-OPTOUT` stays OPEN (nullable FK, 2 USMCA bills still NULL). |
| ☐ | `CLS-MONEY-WORM-GAP` | **P0** | CC-1 (money/WORM) | — | — | — | — | — | **VERIFIED ✓ 99.6% DRAINED 2026-08-07** — CC-1's `ACCT-F160` re-measured live: unprotected **47 → 27**, at-risk rows **33,472 → 119**, both-layer tables **8 → 18**; `invoice_lines` + `payments` now carry BOTH layers. **Row stays OPEN for the residual 27.** Baseline → **27**. |
| ☐ | `LV-ESCROW-SUBLEDGER-NOT-WORM` | P1 | CC-1 (money/WORM) | — | — | — | — | — | **VERIFIED ✓ PARTIAL 2026-08-07** — all 4 tables (`escrow_ledger`, `escrow_balances`, `escrow_deductions_pending`, `settlement_lines`) now carry a BEFORE DELETE trigger. **But `ih35_app` still HOLDS the DELETE grant on all 4 — trigger-only, and that trigger yields to every role except `ih35_app` (item 88). Half-protected, not closed.** |
| ☐ | `LV-G18-INERT-ON-EXPENSE-LINES` | P1 | CC-1 (money) | — | — | — | — | — | **CC-3 filed 2026-08-07** — `line_category` NULL on all **33,980** expense lines and `load_required` never TRUE, so the G18 trigger can never fire on the expense path. Registry is correctly seeded (9 categories); the classification side was never wired. |
| ☐ | `LV-DRIVER-BILLS-IS-A-MONEY-EVENT` | P2 | CC-1 (money/WORM) | — | — | — | — | — | **CC-3 filed 2026-08-07, re-confirmed live** — `driver_finance.driver_bills` is **STILL EXPOSED** (`can_delete=true`, `del_trg=0`). Schema proves it is a per-load earning document, not config. One line in the next sweep. |
| ☐ | `LV-BILL-MDATA-VENDOR-FK-OPTOUT` | P2 | CC-1 (money) | — | — | — | — | — | **CC-3 filed 2026-08-07** — the entity-consistent vendor FK is NULLABLE; 2 of 11 USMCA bills carry `mdata_vendor_id = NULL` and bypass it. Same mechanism as the un-merged half of ACCT-F158. |
| ☐ | `LV-FILE-LINK-ENTITY-TYPE-3WAY-MISMATCH` | P2 | mechanical lane | — | — | — | — | — | **CC-3 filed 2026-08-07** — FE `FileEntityType` (8) and backend Zod enum (8) advertise `settlement`/`invoice`; `SUPPORTED_LINK_ENTITY_TYPES` (6) rejects them, **inside the upload transaction — so the throw rolls back the whole file upload.** Second instance of the KANBAN-DROPSTATUS drift class. |
| ☐ | `LV-OUTBOX-HANDLER-SETS-WRONG-TENANT-GUC` | **P1** | mechanical lane | — | — | — | — | — | **CC-3 PROVEN live 2026-08-07 — SCOPE CORRECTED SAME SESSION: it is ONE handler, not seven.** `fmcsa-customer-verify` sets only `app.operating_company_id` and no `app.bypass_rls`, so `mdata.customers` RLS (which keys on user identity) hides the row: 3 of 4 events failed `missing_or_cross_tenant` on customers that **exist, are active, and match the payload entity**. **6 of 7 handlers set the bypass correctly — `tms-vendor-push.handler.ts:246` is the reference; the fix is one line.** See `LV-OUTBOX-GUC-IS-ONE-HANDLER-NOT-SEVEN`. |
| ☑ | `LV-USMCA-ACTIVE-DRIVERS-HAVE-NO-PAY-RATE` | **P0 · GO-LIVE BLOCKER — RESOLVED** | CC-3 (owner-assigned) | **CC-3** | direct-to-prod (owner directive) | 2026-08-07 | **Active drivers with usable rate 0 → 24; USMCA drivers unrated → 0; 92 rate rows for 92 drivers; duplicate open rates 0; TRANSP unchanged at 92** | seeding verified in-transaction; guard still recommended (assert every Active driver in an entity has a usable rate) | **VERIFIED ✓ by CC-3 2026-08-07** — owner directive *"ALL DRIVERS IN USMCA … .48 A MILE"* executed: 91 rows inserted at `per_mile_pay` / **48c** / `short_miles` / `is_active`, 1 driver skipped (already held an open rate, not overwritten). See `LV-USMCA-PAYRATE-48C-SEEDED-2026-08-07`. | **CC-3 PROVEN live 2026-08-07** — USMCA Active drivers **24**, USMCA pay rates **1** (belongs to none of the 24), **Active drivers with a usable pay rate = 0**. `book-load.service.ts:456` throws for every one, so no driver can be assigned to a USMCA load. Holds down 4 red dots (settlement, deductions, escrow, driver half of hop.assign). **Do NOT point at TRANSP's 92 rates — entity-scoped predicate, and the directive forbids sharing.** Seed 24 USMCA rows with sensible defaults (owner edits later); pay is a 1099 wage/fee, never a % of linehaul. |
| ☐ | `LV-DEPLOY-NOT-ADVANCED-6020040` | **P0 · MONDAY** | deploy owner / F162 permit-CHECK fix | — | — | — | — | — | **CC-3 VERIFIED live 2026-08-07** — prod `version=6020040` on two polls 4 min apart (uptime 2734→2950s, no redeploy). `202612310000` and `202612320000` are **on origin/main but applied=0** in `ih35_migrations.applied_migrations` (control 895). **F160–F167 are NOT live.** Re-check: version past 6020040 **and** both ledger rows present. |
| ☐ | `LV-USMCA-NO-DISPATCHER-ACCOUNT` | **P0 · MONDAY** | owner / user provisioning | — | — | — | — | — | **CC-3 VERIFIED live 2026-08-07** — `org.user_company_access` for USMCA = **4 users: 1 Owner + 3 Drivers. Zero Dispatcher/Manager/Administrator/Accountant.** No non-Owner human can log in and dispatch Monday. Not an RLS defect — the mechanism works; the users don't exist. |
| ☐ | `LV-HOS-LIVE-AND-F167-UNFIRED-2026-08-07` | P1 · Monday risk | mechanical lane (F167) | — | — | — | — | — | **CC-3 VERIFIED live 2026-08-07** — HOS feed **PASS** (631,264 events, newest 20:56:40Z, 24 drivers/45d). F167 `auto_status_switch_worker` **alive** (279 runs today, last success 21:55) **but has NEVER fired**: `in_transit` loads = 0 all entities, geofence events 7d = 0, auto_status audit 7d = 0 (control 2,497,639). **UNEXERCISED, not broken.** Prove it by letting GPS move the item-1 load, not a manual status set. |
| ☐ | `LV-DA-RANDOM-POOL-QUARTERLY-DRAW-NEVER-RAN` | P2 · FMCSA | mechanical lane | — | — | — | — | — | **CC-3 VERIFIED live 2026-08-07** — the sole job with `last_successful_run_at IS NULL` of 86. Error `for SELECT DISTINCT, ORDER BY expressions must appear in select list` — a plain SQL bug, so the quarterly random D&A pool draw has **never** been performed. Regulated quarterly obligation with no system selection record. |
| ☐ | `LV-TXN-REGISTER-VERIFY-03-DELIVERED-LOAD-FAIL` | **P0** | CC-1 (money — revenue latch) | — | — | — | — | — | **CC-3 PROVEN live 2026-08-07 — the created-but-doesn't-register gap.** 2 USMCA loads in delivered states (`L-20260802-0258`=delivered, `LUSMCAFREIGHT-20260806-0001`=delivered_pending_docs) posted **0 revrec, 0 A/R, 0 GL**. Discriminator: `load_revenue_recognition_postings` `visible_all=2==n_live_tup=2==n_tup_ins=2` — 2 rows in the table's lifetime, neither USMCA. Same root cause as `LV-TXN-004`. **Asymmetry for the fixer:** one load has 2 driver bills + 0 settlements, the other 1 settlement + 0 driver bills. |
| ☐ | `LV-SCENARIO-REVENUE-DOT-IS-FALSE-GREEN` | **P0** | CC-1 (money — probe semantics) | — | — | — | — | — | **CC-3 PROVEN live 2026-08-07** — the "Revenue recognition latch" dot is GREEN on USMCA while `load_revenue_recognition_postings` for USMCA = **0** and `unbilled_revenue` GL lines = **0**. Its probe is **byte-identical** to `hop.invoice` — it measures invoice status, not the latch. **Under the owner's "drive every dot green" directive this dot cannot fail, and it certifies exactly what `LV-TXN-004` proves is broken.** |
| ☐ | `LV-USMCA-SCENARIO-MAP-2026-08-07` | info | ALL LANES (work list) | — | — | — | — | — | **CC-3 reference 2026-08-07** — all 24 tracker probes run VERBATIM on USMCA: **14 green / 10 red**, each red dot's blocker measured. 6 of 10 exercisable today with no code fix; 2 blocked on `LV-TXN-004`; 1 hard-blocked on `LV-WO-CREATE-500-OPENED-AT`; 1 config-gated. |
| ☐ | `LV-ACCT-F158-IS-ISOLATED` | info | CC-1 (informational) | — | — | — | — | — | **CC-3 scope note 2026-08-07** — parity sweep bounds the ACCT-F158 P0: **11 of 12** entity FKs and **135 of 135** triggers are repo-traceable. Fix is ONE migration, not a remediation programme. |

---

## CC-3 CREATED-TXN REGISTRATION VERIFY — per-surface PASS/FAIL (owner order 2026-08-07)

*For each transaction created in USMCA: balanced JE in the GL (or correctly no-GL by design) · both-way
linkage (source↔JE, source↔operational parents) · economics correct. Every run reads unmasked with the
correct scope per table and a positive control on the same table. `mdata.drivers/units/loads` RLS is NOT
keyed on `app.operating_company_id` — units/equipment have no such column at all.*

| run | date | surface | verdict | evidence |
|---|---|---|---|---|
| 01 | 2026-08-07 | **bank categorization** | **PASS** (4/4) | txn `cb271ba0` $918.00 → JE `ff746cfa` 120 ms later. Balanced DR=CR 91,800 · DR `6999` / CR `1000` correct for money-out · forward + reverse links (2 `transaction_source_links`) · `abs(amount_cents)` = GL debit **to the cent** · USMCA on source, JE and both postings |
| 02 | 2026-08-07 | **all surfaces, 24h window** | **PASS** (10/10 JEs · 5/5 docs) | 10 JEs: all balanced, 2 lines each, **0 lines missing an account**, **2 source links each**. Correct pairs: bill `2000`/`5400` · bill-payment `1295`/`2000` · invoice `1100`/`4000` · categorization `1000`/`6300`,`1000`/`6999`. Docs: bill REGISTERED · `INV-2026-00007` REGISTERED · `INV-2026-00006` proforma = **correctly no-GL by design** · 2 loads pre-delivery/cancelled = correctly no revrec |
| 04 | 2026-08-07 | **USMCA active-driver roster (owner task)** | **DONE + VERIFIED** (5/5) | Owner-assigned build task. HOS-45d active = **24**, all on TRANSP, 0 on USMCA. Pre-write match check: **0 duplicate CDL, 0 duplicate name, 0 cdl-vs-name conflicts** — no fuzzy matching used. Wrote in one transaction with `app.bypass_rls` set: 18 USMCA rows linked to their Samsara ID + set Active, **6 USMCA rows CREATED** (carry-over from TRANSP), all others set Inactive. **Disclosed extra mutation:** cleared `deactivated_at` on 18 and `archived_at` on 2 — forced by CHECK `chk_drivers_status_deactivated_consistent` and by the owner's own "can be assigned a truck" criterion. First attempt failed that constraint and **rolled back whole — no partial state**. Verified: Active=**24** · 1:1 to HOS-active=**24** · distinct Samsara ids=**24** · Active rows still deactivated/archived=**0** · USMCA-leased live trucks=**40**. No TRANSP/TRK row modified. See `LV-USMCA-ROSTER-HOS45-2026-08-07`. |
| 05 | 2026-08-07 | **entity-leak class (USMCA, universal)** | **PASS** (14 edges / 405 rows) | Every USMCA row on each FK edge joined to its parent, parent entity compared to USMCA. **0 cross-entity refs on all 14 exercised edges** — bank_txn→bank_account 163 · driver_pay_rates→driver 92 · je_postings→account 56 · je_postings→JE 56 · bills→vendor 9 · invoices→customer 7 · loads→customer 4 · loads→driver 4 · loads→unit 4 · invoices→source_load 3 · payments→customer 3 · driver_bills→load 2 · settlements→driver 1 · expenses→unit 1. **Built-in control: every edge non-empty.** 40 leased units resolve to exactly 1 owner (TRK) — correct model. **`bills→unit` and `fuel→unit` returned 0 rows and are explicitly NOT claimed.** See `LV-USMCA-ENTITY-LEAK-CLASS-CLEAN-2026-08-07` + `LV-USMCA-ENTITY-LEAK-UNITS-EDGE-2026-08-07`. |
| 03 | 2026-08-07 | **delivered load** | **★ FAIL (P0)** | **2 loads in delivered states posted NOTHING** — 0 revrec, 0 A/R, 0 GL. Handed to CC-1 as `LV-TXN-REGISTER-VERIFY-03-DELIVERED-LOAD-FAIL`. Predicted in run #02 and confirmed. |

**SURFACES STILL UNEXERCISED (cannot be verified until the harness creates one):** fuel txn (USMCA has 0 —
all 1,555 fuel rows are TRANSP and must NOT be borrowed) · work order (**hard-blocked** by
`LV-WO-CREATE-500-OPENED-AT`) · driver advance · escrow movement · settlement deduction · vendor credit ·
factoring advance · insurance claim · legal matter · POD/BOL file link (`docs.file_links` `n_tup_ins = 0`).

**STANDING RULE FOR EVERY FUTURE RUN:** a delivered USMCA load must show `revrec_rows > 0`. **Never confirm
revenue recognition from the Scenario Tracker's revenue dot — it is GREEN today and is a proven false green
(`LV-SCENARIO-REVENUE-DOT-IS-FALSE-GREEN`).**

---

## CLOSED / WITHDRAWN BY CC-3 (no coder action required)

These were filed and then **withdrawn or superseded by CC-3 itself** after re-verification — recorded, never
deleted, so the correction is auditable. **No lane owes work on these.**

| Finding ID | Sev | Why it is closed |
|---|---|---|
| `CI-F20` | — | — |
| `CI-F22` | — | — |
| `LV-ANSWERS-LOCATED` | — | EVIDENCE — removes every "awaiting owner decision" excuse on financial cards |
| `LV-GLDARK-BLOCKED` | — | EVIDENCE + BLOCKER — re-scopes the P0; no build until stops are fixed |
| `LV-WF064-ALIVE` | P1 | EVIDENCE — refutes the 2 WF064 cards; no build required |
| `LV-LATCH-GUARD-BLIND` | — | GUARD FIXED (unmerged) — blocks on `LV-BULK-DELIVER-NOLATCH` |
| `CI-BLOCK-ACCEPTANCE-RED-ON-MAIN` | — | WITHDRAWN (self-corrected) 2026-08-07 |
| `LV-FUEL-LOAD-ATTRIBUTION-NEVER-MATCHES` | P1 | **WITHDRAWN by CC-3 2026-08-07, ~20 min after filing, before any lane acted.** Filed because 1,555 of 1,555 TRANSP fuel transactions have `load_id IS NULL` and the rematch service has attributed none. Every number was true; the conclusion was not. **TRANSP's 5 loads are all 2026-06-16→06-27 and the fuel spans 2026-07-16→08-07 — the windows never overlap, so zero matches is the only arithmetically possible result.** Expected state, and already dispositioned by `fuel-load-attribution-coverage.db.test.ts:17-18`. **No lane owes work.** |
---

## ENFORCEMENT — stated honestly

**What is enforceable today:** this register is committed to the repo, is the named source of truth in the
board's standing rule, and every OPEN row names a lane and a definition of done. Any lane, and the owner,
can read completion state at a glance.

**What is NOT yet machine-enforced, and must not be assumed:** there is no CI guard failing the build when a
finding is fixed without its box ticked, or when a box is ticked without live proof. CC-3 cannot wire a
verify-step (`CI-CC3-GUARDS-NEED-A-BANDED-ADOPTER`), so the guard for this rule must be written by a banded
lane. **Required guard, specified here so the adopting lane has the spec:**

> `verify-findings-register-signoff.mjs` — for every row in this register marked `☑`, assert the row carries
> a non-empty **PR**, **Date**, **Live proof** and **Guard** cell; and for every finding id present in
> `GUARD-WORKORDERS.md` with status OPEN, assert a matching `☐` row exists here. Fail the build otherwise.
> That makes "the list is complete and honest" a build-time property instead of a promise.

Until that guard exists, this rule is **documented and mandatory but not machine-enforced** — recorded
plainly, because per LAW-2026-08-05-B2 an unenforced rule is not yet law, and pretending otherwise is the
exact failure this register exists to prevent.
