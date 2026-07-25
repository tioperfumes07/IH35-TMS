<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F13 — F13 · external fine lifecycle actions not wired
**FINDING:** F13 (P1; reclassified FIN-HOLD — fine money) · **Lane:** FINANCIAL-HOLD (external-fine lifecycle moves money to a third-party authority; per Rule 13 "fine money = FINANCIAL-HOLD") · **Module:** Safety (External Fines).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Safety/External Fines lifecycle) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§external fine → vendor/authority · §Safety linkage §10.3) · IH35_ARCHITECTURAL_DESIGN.md (module Safety) · docs/lockdown/00_LOCKED_DECISIONS.md (fine→liability/expense; AP path; Rule 13/19)
Approved screens reviewed: docs/approved-screens/safety.png
Tab count check (Rule 05): design says N Safety leaves · this block changes count to same N (wire external-fine lifecycle — no leaf change).
Deviations from spec: None.
NEW SPEC items (Rule 01): None.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
The external-fine lifecycle actions (issue by an authority → contest → uphold/dismiss → accrue liability → pay the authority / recover from driver → close) are rendered but NOT WIRED — so an external fine (money owed to a DOT/state authority, often recoverable from the driver) cannot progress and its liability/AP + any driver recovery never post. **Step 1 — reproduce (Rule 10, lucia):** (a) grep the external-fine UI for the lifecycle action buttons; confirm handlers missing/no-op/unregistered. (b) Confirm the external-fine table + status columns + the authority/vendor reference: `SET app.bypass_rls='lucia'; SELECT column_name FROM information_schema.columns WHERE table_schema='safety' AND table_name IN ('civil_fines','external_fines');` (do not assume names — not in backbone; the AP authority is `mdata.vendors`, backbone-noted canonical AP truth). Prod branch br-fancy-credit-akjnd07a wins.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: external-fine transitions write append-only status on the canonical fine table [AUDIT — confirm live]; the payable-to-authority references `mdata.vendors` (backbone: canonical AP truth) and posts liability/expense to `accounting.journal_entries`/`accounting.bills` against OWNER-SELECTED accounts (Rule 19-aware); driver recovery routes through the driver_finance deduction (SAF-F02/F03 applied columns). NEVER held columns, NEVER RETIRE tables.
2. Hub matrix (both-way): external fine → `mdata.drivers` (recovery) · `mdata.units` · `org.companies` · `mdata.vendors` (authority payee) · `accounting.journal_entries`/`bills` · `legal.matters` (if contested) · `identity.users` (actor).
3. Cross-module (Rule 21 §1) — Safety §10.3: external fine → Driver, Unit, Operating Company; → Accounting (AP/liability + driver recovery); → Legal(case); Driver Fines reverse section (SAF-F16) shows state both ways.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
McLeod/Alvys external-violation-and-fine handling with authority-as-payee + driver recovery; QuickBooks/NetSuite AP: a fine owed to an authority is a bill/liability to a vendor with a matched JE. ASC 470-60 build-and-HOLD; actor-stamped transitions.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — transitions append-only, void-not-delete. Enforce: operating_company_id RLS on the fine table · security_invoker views · append-only audit per transition · display IDs server-generated · +Create/+Book semantics. **Financial (FIN-HOLD): Rule 13** — build-and-HOLD; reuse the poster (no new GL math); parallel books; QBO NEVER written; flags OFF; ASC 470-60. **Rule 19** — reserve/liability accounts owner-manual, untouched. Vendor/authority via `mdata.vendors` (never mdata.qbo_* write target).

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = external-fine lifecycle actions have no handlers, so authority-AP + driver-recovery economics never post. Fix: wire each action to a validated, entity-scoped, actor-stamped transition that (1) writes the append-only status change, (2) for the accrue/pay transitions, routes through the reused poster (build-and-HOLD, flags OFF) to record the liability/bill against the authority vendor (`mdata.vendors`) at owner-selected accounts, and (3) for driver recovery, links the driver_finance deduction (SAF-F02/F03). No invented account/vendor; no bypass of the state machine.

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-external-fine-lifecycle.mjs` + `scripts/verify-steps/NNN-verify-external-fine-lifecycle.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (external-fine lifecycle action with no handler / no state write / no AP link), PASSes on fix (validated audited transition; authority AP + driver recovery post via poster). `--selftest` mutates a real action copy to no-op, asserts flagged; asserts the wired transition not flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, drive an external fine through its lifecycle; the authority payable posts to mdata.vendors with a matched JE (flags OFF), driver recovery links a real deduction; QBO untouched; guard green. UNVERIFIED — handlers + state machine + vendor link pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F13
LANE: FINANCIAL-HOLD
DOD-A: FAIL→PASS — external-fine lifecycle actions become active; no DUAL_PATH_OLD_ACTIVE twin.
DOD-B: PASS — transition inputs (authority vendor, account, amount, reason) controlled AND in payload.
DOD-C: PASS — fine ↔ vendor ↔ JE/bill ↔ driver deduction FKs both ways; no held column, no memo/uuid-in-name/jsonb.
DOD-D: PASS — each money transition picks its money object (AP liability GL, expense, recovery deduction); no silent default.
DOD-E: UNVERIFIED — handlers + state machine + vendor link pending Step-1.
VERIFY-1: PASS — lifecycle drawer QBO chrome; +Book for the bill; drawer-on-drawer for vendor/account pickers.
VERIFY-2: PASS — vendor picker → mdata.vendors; account picker postable-filter (F14); reason catalog-bound (F15); write=read; entity-scoped.
VERIFY-3: FAIL→PASS — nav→Safety external fine→action→API→fine table + mdata.vendors + journal_entries/bills + driver_finance (never held/RETIRE, never mdata.qbo_*)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — deep chain: fine→authority bill+payment→driver recovery deduction, each both ways under build-and-HOLD.
VERIFY-5: PASS — TRANSP + USMCA isolation; drivers-as-vendors/authority-as-vendor scoping; no cross-entity leak.
VERIFY-6: PASS (build-and-HOLD) — matched JE via reused poster; owner-selected AP/liability accounts; flags OFF; NO TMS→QBO write-back.
VERIFY-7: PASS — Safety leaf count unchanged.
VERIFY-8: PASS — FORCE RLS on fine table + vendor link; correct GUC; security_invoker; grants; server-side transition validation.
MODULE_PROGRESS: safety N of M (must match docs/module-completion/safety.json AFTER this PR)
ITEMS_TOUCHED: external-fine-lifecycle-actions, fine-state-machine, authority-vendor-link, driver-recovery-deduction (via F02/F03)
MIGRATE: N/A for wiring; authority-vendor + driver-recovery links depend on applied columns (SAF-F02/F03 migrations above BOTH 202607950000 and 202607960000, distinct, FORCE RLS). Any new external_fines column added idempotently above both maxes with FORCE RLS + REVOKE DELETE + dynamic org.companies + checksum-override same PR.
ROOT CAUSE: external-fine lifecycle actions have no handlers → authority AP + driver recovery never post.
FIX: wire each action to a validated, audited transition; accrue/pay via reused poster to mdata.vendors + owner-selected accounts; recovery via driver_finance deduction. Files: external-fine action handlers, state-machine, vendor/account/poster integration.
GUARD: scripts/verify-steps/NNN-verify-external-fine-lifecycle.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 handler reproduce + prod lifecycle + AP/recovery proof.
REMAINING: money transitions depend on SAF-F02/F03; SAF-F18 fixes the external-fine driver/load/unit pickers this lifecycle consumes; no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
