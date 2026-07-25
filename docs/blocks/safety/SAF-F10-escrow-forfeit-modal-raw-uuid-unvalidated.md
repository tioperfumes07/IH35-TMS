<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F10 — F10 · Escrow Forfeit modal: raw-UUID liability box, unvalidated amount/reason
**FINDING:** F10 (P1, FIN-HOLD) · **Lane:** FINANCIAL-HOLD · **Module:** Safety (Driver Escrow — forfeit modal).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Safety/Driver Escrow) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Picker law · §validation) · IH35_ARCHITECTURAL_DESIGN.md (module Safety) · docs/lockdown/00_LOCKED_DECISIONS.md (money forms validated; postable-account picker; Rule 13/19)
Approved screens reviewed: docs/approved-screens/safety.png · docs/approved-screens/3AccountingDropdown.png
Tab count check (Rule 05): design says N Safety leaves · this block changes count to same N (modal UX + validation — no leaf change).
Deviations from spec: None.
NEW SPEC items (Rule 01): None.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
The Escrow Forfeit modal asks the user to paste a RAW UUID into a "liability account" text box (no account picker) and does NOT validate the amount (e.g. ≤ held balance, > 0) or require a reason. A raw-UUID box invites a wrong/typo'd or cross-entity account; an unvalidated amount can over-forfeit; a missing reason breaks the audit trail. This is a money form failing the universal-picker law + basic financial validation. **Step 1 — reproduce (Rule 10, lucia):** grep the Forfeit modal component; confirm the liability field is a free-text UUID input (not the account picker), and that amount/reason lack validation. Confirm the account picker must filter to postable liability accounts: backbone `catalogs.accounts` is PER-ENTITY (1392 populated, RLS forced, `= GUC`). Prod branch br-fancy-credit-akjnd07a wins.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: the liability account is chosen via the account picker bound to `catalogs.accounts` (PER-ENTITY, backbone-verified), filtered to postable liability accounts (SAF-F14) — NEVER a raw-UUID box, NEVER a RETIRE table. Reason binds to the escrow-reason catalog / structured field.
2. Hub matrix (both-way): forfeiture → `catalogs.accounts` (liability GL, owner-manual per Rule 19) · `mdata.drivers` · `org.companies` · `accounting.journal_entries` (matched, build-and-HOLD).
3. Cross-module (Rule 21 §1) — Safety §10.3: modal drives the F01 route → escrow ledger + JE; Driver detail Escrow section shows it both ways.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
QuickBooks/NetSuite money-modal discipline: account is a validated picker (never a raw ID), amount is bounded (>0, ≤ available), a reason/memo is required for auditability. Universal picker law (all 7 clauses). ASC 470-60 build-and-HOLD.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/repair — replace the raw-UUID box with the picker; add validation; no data change. Enforce: operating_company_id RLS on escrow + accounts · security_invoker views · append-only audit on forfeiture · display IDs server-generated · +Create semantics. **Financial (FIN-HOLD): Rule 13** — build-and-HOLD; reused poster; QBO NEVER written; flags OFF; ASC 470-60. **Rule 19** — escrow liability account owner-manual; picker SELECTS, never creates a reserve account.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = a money modal uses a free-text UUID for the account and skips validation. Fix: (1) replace the raw-UUID box with the account picker bound to `catalogs.accounts`, filtered to postable liability accounts, entity-scoped, 7-clause compliant (SAF-F14); (2) validate amount (> 0 AND ≤ current held balance) server-side AND client-side; (3) require a structured reason (catalog-bound or required text) for the audit trail; (4) block submit until valid. The modal feeds the F01 route + F09 agreement terms; it never invents an account or amount.

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-escrow-forfeit-modal.mjs` + `scripts/verify-steps/NNN-verify-escrow-forfeit-modal.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (liability field is raw-UUID text / amount unvalidated / reason optional), PASSes on fix (account picker + bounded amount + required reason). `--selftest` mutates a real modal copy back to a raw-UUID box, asserts flagged; asserts the picker+validation shape not flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, the Forfeit modal shows a postable-liability account picker (entity-scoped, inline +Add first row), rejects amounts > held balance and ≤ 0, requires a reason, and only then posts via F01; guard green. UNVERIFIED — modal component path pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F10
LANE: FINANCIAL-HOLD
DOD-A: PASS — forfeit modal is the active path (with F01); no DUAL_PATH_OLD_ACTIVE twin.
DOD-B: FAIL→PASS — every modal field (account picker, amount, reason) controlled AND in payload; submit blocked until valid.
DOD-C: PASS — forfeiture ↔ accounts ↔ driver ↔ JE FKs both ways via real account_id (not a pasted string); no memo/uuid-in-name/jsonb.
DOD-D: PASS — purpose (forfeit) picks the postable liability account + bounded amount; no silent default.
DOD-E: UNVERIFIED — modal path pending Step-1; accounts hub verified in backbone.
VERIFY-1: PASS — ParityDrawer/QBO chrome; amount + Due fields; drawer-on-drawer for the account picker.
VERIFY-2: FAIL→PASS — account picker: catalog behind it (catalogs.accounts) · inline +Add first row · opens QBO wizard · write=read canonical · appears+selected+survives reload · entity-scoped · postable-liability filter (SAF-F14).
VERIFY-3: PASS — nav→Safety escrow→modal→API→catalogs.accounts + escrow ledger + journal_entries (never RETIRE)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — deep chain: forfeit→matched JE (build-and-HOLD) both ways.
VERIFY-5: PASS — TRANSP + USMCA isolation; account picker cannot select a cross-entity account.
VERIFY-6: PASS (build-and-HOLD) — matched JE via reused poster; postable liability control account; flags OFF; NO TMS→QBO write-back.
VERIFY-7: PASS — Safety leaf count unchanged.
VERIFY-8: PASS — FORCE RLS on accounts + escrow; correct GUC; security_invoker; server-side amount + scope validation; grants.
MODULE_PROGRESS: safety N of M (must match docs/module-completion/safety.json AFTER this PR)
ITEMS_TOUCHED: escrow-forfeit-modal, liability-account-picker, amount-reason-validation
MIGRATE: N/A — UI + validation; no DDL (catalogs.accounts already PER-ENTITY per backbone).
ROOT CAUSE: forfeit modal uses a raw-UUID text box for the liability account and skips amount/reason validation.
FIX: postable-liability account picker + bounded amount + required reason; block submit until valid. Files: Escrow Forfeit modal component, account-picker binding, validation + server guard.
GUARD: scripts/verify-steps/NNN-verify-escrow-forfeit-modal.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 modal reproduce + prod picker/validation proof.
REMAINING: pairs with SAF-F01 (route), F09 (terms), F14 (postable filter); no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
