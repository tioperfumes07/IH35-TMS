<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F12 — F12 · internal fine lifecycle actions not wired
**FINDING:** F12 (P1; reclassified FIN-HOLD — fine money) · **Lane:** FINANCIAL-HOLD (fine lifecycle moves money; per Rule 13 "fine money = FINANCIAL-HOLD" though the finding line did not pre-tag FIN) · **Module:** Safety (Internal Fines).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Safety/Internal Fines lifecycle) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§fine states · §Safety linkage §10.3) · IH35_ARCHITECTURAL_DESIGN.md (module Safety) · docs/lockdown/00_LOCKED_DECISIONS.md (fine→liability/expense; Rule 13/19)
Approved screens reviewed: docs/approved-screens/safety.png
Tab count check (Rule 05): design says N Safety leaves · this block changes count to same N (wire existing lifecycle actions — no leaf change).
Deviations from spec: None.
NEW SPEC items (Rule 01): None — the fine states are specified; the actions are dead.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
The internal-fine lifecycle actions (e.g. issue → contest → uphold/waive → convert-to-liability → deduct/pay → write-off) are rendered but NOT WIRED — buttons that no-op or call missing handlers, so a fine cannot legitimately progress through its states and its money never reaches the ledger. **Step 1 — reproduce (Rule 10, lucia):** (a) grep the internal-fine UI for the lifecycle action buttons; for each, confirm the handler is missing / no-op / points to an unregistered route. (b) Confirm the fine table + its status/state machine columns: `SET app.bypass_rls='lucia'; SELECT column_name FROM information_schema.columns WHERE table_schema='safety' AND table_name='civil_fines';` (do not assume names/enum — not in backbone; note F02/F03 held columns). (c) In browser, attempt each lifecycle action, confirm it no-ops. Prod branch br-fancy-credit-akjnd07a wins.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: lifecycle transitions write append-only status changes on `safety.civil_fines` [AUDIT — confirm live]; money-affecting transitions (convert-to-liability, deduct, write-off) route through the reused poster to `accounting.journal_entries` against OWNER-SELECTED accounts (Rule 19-aware) and the driver_finance deduction (via SAF-F02/F03 applied columns). NEVER held columns, NEVER RETIRE tables.
2. Hub matrix (both-way): fine → `mdata.drivers` · `org.companies` · `identity.users` (actor per transition) · `accounting.journal_entries` · driver_finance deduction · `catalogs.accounts`.
3. Cross-module (Rule 21 §1) — Safety §10.3: fine → Driver, Unit, Operating Company; → Accounting (liability/expense); → Legal(case) if contested; Driver Fines reverse section (SAF-F16) shows state both ways.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
McLeod/Alvys fine-and-violation lifecycle with an auditable state machine; QuickBooks/NetSuite: each money transition posts a matched JE. ASC 470-60 build-and-HOLD; every state change actor-stamped.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — transitions are append-only status changes, void-not-delete; no state erasure. Enforce: operating_company_id RLS on civil_fines · security_invoker views · append-only audit per transition · display IDs server-generated · +Create semantics. **Financial (FIN-HOLD): Rule 13** — build-and-HOLD; money transitions reuse the poster (no new GL math); parallel books; QBO NEVER written; flags OFF; ASC 470-60. **Rule 19** — liability/reserve accounts owner-manual, untouched.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = lifecycle action buttons have no handlers, so fines are stuck and their economics never post. Fix: wire each internal-fine lifecycle action to a real, entity-scoped, actor-stamped transition that (1) validates the allowed state transition, (2) writes an append-only status change, and (3) for money transitions, routes through the reused poster (build-and-HOLD, flags OFF) to the owner-selected liability/expense account and the applied driver_finance deduction (depends on SAF-F02/F03). No transition invents an account or bypasses the state machine.

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-internal-fine-lifecycle.mjs` + `scripts/verify-steps/NNN-verify-internal-fine-lifecycle.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (a lifecycle action with no handler / no state write), PASSes on fix (each action performs a validated, audited transition; money transitions post via the poster). `--selftest` mutates a real action copy to no-op, asserts flagged; asserts the wired transition not flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, drive a fine through its full lifecycle; each transition persists (status + actor + timestamp); money transitions post a matched JE (flags OFF) to owner-selected accounts; QBO untouched; guard green. UNVERIFIED — action handlers + state machine pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F12
LANE: FINANCIAL-HOLD
DOD-A: FAIL→PASS — lifecycle actions become the active path (were dead); no DUAL_PATH_OLD_ACTIVE twin.
DOD-B: PASS — transition inputs (reason, account, amount where applicable) controlled AND in payload.
DOD-C: PASS — fine ↔ driver ↔ JE ↔ deduction FKs both ways (via F02/F03 applied columns); no held column, no memo/uuid-in-name/jsonb.
DOD-D: PASS — each money transition picks its money object (liability/expense GL, deduction) with no silent default.
DOD-E: UNVERIFIED — handlers + state machine + fine columns pending Step-1.
VERIFY-1: PASS — lifecycle drawer QBO chrome; +Create/+Book semantics; drawer-on-drawer for account picker.
VERIFY-2: PASS — account picker postable-filter (F14); reason picker catalog-bound (F15); write=read; entity-scoped.
VERIFY-3: FAIL→PASS — nav→Safety internal fine→action→API→civil_fines + journal_entries + driver_finance (never held/RETIRE)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — deep chain: issue→contest→liability→deduction/pay→write-off, each both ways under build-and-HOLD.
VERIFY-5: PASS — TRANSP + USMCA isolation; no cross-entity fine leak.
VERIFY-6: PASS (build-and-HOLD) — matched JE via reused poster; owner-selected control accounts; flags OFF; NO TMS→QBO write-back.
VERIFY-7: PASS — Safety leaf count unchanged.
VERIFY-8: PASS — FORCE RLS on civil_fines; correct GUC; security_invoker; grants; server-side transition validation.
MODULE_PROGRESS: safety N of M (must match docs/module-completion/safety.json AFTER this PR)
ITEMS_TOUCHED: internal-fine-lifecycle-actions, fine-state-machine, fine-money-poster (via F02/F03)
MIGRATE: N/A for the wiring itself; money transitions depend on SAF-F02/F03 applied-column migrations (above BOTH 202607950000 and 202607960000, distinct, FORCE RLS). No new DDL in this block if those land first.
ROOT CAUSE: internal-fine lifecycle action buttons have no handlers → fines cannot progress and their money never posts.
FIX: wire each action to a validated, audited state transition; money transitions post via the reused poster (build-and-HOLD). Files: internal-fine action handlers, fine state-machine module, poster integration.
GUARD: scripts/verify-steps/NNN-verify-internal-fine-lifecycle.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 handler reproduce + prod full-lifecycle + matched-JE proof.
REMAINING: money transitions depend on SAF-F02/F03; land those first; no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
