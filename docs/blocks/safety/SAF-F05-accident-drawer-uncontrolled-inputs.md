<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F05 — F05 · Accident drawer: 6 uncontrolled inputs + 2 no-op comboboxes + un-persisted cost lines (payload carries 6 keys)
**FINDING:** F05 (P0, no FIN-HOLD on the shell; cost lines have money implications — see note) · **Lane:** NON-FINANCIAL (data-capture correctness; the cost-line economics route through the accident→claim/expense blocks) · **Module:** Safety (Accident capture).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Safety/Accident capture) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Safety linkage §10.3 · §cost lines) · IH35_ARCHITECTURAL_DESIGN.md (module Safety) · docs/lockdown/00_LOCKED_DECISIONS.md (any cost line that hits GL is FIN-HOLD via F02/F04)
Approved screens reviewed: docs/approved-screens/safety.png
Tab count check (Rule 05): design says N Safety leaves · this block changes count to same N (fixes the accident drawer's field wiring — no leaf change).
Deviations from spec: None.
NEW SPEC items (Rule 01): None — the drawer already specifies these fields; they must actually persist.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
The Accident drawer renders 6 UNCONTROLLED inputs (no value/onChange binding → user text is lost), 2 comboboxes that are NO-OPs (render options but never set state), and cost lines that are NOT persisted; the submit payload carries only 6 keys — so most of what the user types never reaches the server (DOD-B wizard-depth violation: a rendered field must be controlled AND in the submit payload). **Step 1 — reproduce (Rule 10, lucia):** (a) grep the Accident drawer component; enumerate rendered fields vs the submit payload keys — confirm the 6 uncontrolled inputs + 2 no-op comboboxes + un-persisted cost lines and the 6-key payload. (b) In browser (TRANSP), fill every field, submit, read the network request body: confirm only 6 keys transmit; reload and confirm the dropped fields are blank. (c) Confirm the accident table columns that SHOULD receive these fields: `SET app.bypass_rls='lucia'; SELECT column_name FROM information_schema.columns WHERE table_schema='safety' AND table_name='accident_reports';` (do not assume names — not in backbone). Prod branch br-fancy-credit-akjnd07a wins.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: every controlled field persists to a REAL column on `safety.accident_reports` (and cost lines to their canonical child table) [AUDIT — confirm columns live]; NEVER dropped, NEVER a jsonb-blob substitute for real FKs.
2. Hub matrix (both-way): accident → `mdata.drivers` · `mdata.units` · `org.companies` · `identity.users` (reporter) · canonical loads [AUDIT] · insurance claim (F04) · `maintenance.work_orders` (damage) · `accounting.journal_entries` (cost lines, build-and-HOLD).
3. Cross-module (Rule 21 §1) — Safety §10.3: accident → Driver, Unit, Operating Company; → Insurance(claim); → Legal(case); → Maintenance(damage WO); → Accounting(cost lines). Driver/Unit detail show the accident both ways (SAF-F16/F17).
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
McLeod/Alvys accident-register completeness: FMCSA accident recordkeeping (§390.15) requires the full accident record be captured and retained. A drawer that silently drops fields fails compliance capture and audit; every rendered field must persist (controlled + in payload).

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/repair — no DROP; wire fields to real columns; cost lines become append-only child rows (void-not-delete). Enforce: operating_company_id RLS on accident_reports + cost-line child · security_invoker views · append-only audit on mutation · display IDs server-generated · +Create semantics. Cost lines that post GL inherit **Rule 13** build-and-HOLD (reused poster, flags OFF, QBO NEVER written) and route their money object through SAF-F02/F04; **Rule 19** reserve accounts untouched.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = fields rendered but not bound (uncontrolled inputs, no-op comboboxes) and cost lines with no persistence path, so the payload is a 6-key subset. Fix: make every rendered field controlled (value+onChange or form-state) AND include it in the submit payload; wire the 2 comboboxes to real state + canonical pickers (SAF-F14/F15); persist cost lines as append-only child rows FK'd to the accident, with any GL effect deferred to the poster (build-and-HOLD). Confirm each field maps to a real accident_reports column (Step-1); if a target column is missing, add it via idempotent migration above both maxes (FORCE RLS) rather than dropping the field.

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-accident-drawer-wizard-depth.mjs` + `scripts/verify-steps/NNN-verify-accident-drawer-wizard-depth.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (rendered-field count > payload-key count; uncontrolled inputs / no-op comboboxes / un-persisted cost lines detected), PASSes on fix (every rendered field controlled AND in payload; cost lines persisted). `--selftest` mutates a real drawer copy to drop a field from the payload, asserts flagged; asserts the fully-wired shape not flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, fill the entire Accident drawer incl. both comboboxes + cost lines, submit, reload → every value persists to the accident_reports row / cost-line children scoped to the entity; guard green. UNVERIFIED — field↔column map + component path pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F05
LANE: NON-FINANCIAL (cost-line GL deferred to F02/F04 under build-and-HOLD)
DOD-A: PASS — Accident drawer is the active capture path; no DUAL_PATH_OLD_ACTIVE/ComingSoon twin.
DOD-B: FAIL→PASS — THIS block: every rendered field (6 inputs + 2 comboboxes + cost lines) controlled AND in the submit payload.
DOD-C: PASS — accident ↔ driver/unit/company/claim/WO FKs both ways; cost lines FK the accident; no memo/uuid-in-name/jsonb-ids.
DOD-D: PASS — cost-line purpose picks its money object via the poster (F02/F04); no silent default; capture fields carry no economics.
DOD-E: UNVERIFIED — field↔column map + payload reproduce pending Step-1.
VERIFY-1: PASS — drawer uses ParityDrawer/QBO chrome; calendar for dates; drawer-on-drawer for pickers.
VERIFY-2: PASS — the 2 comboboxes bind to canonical catalog pickers (7-clause, SAF-F15); inline +Add first row; write=read; entity-scoped.
VERIFY-3: FAIL→PASS — nav→Safety accident→drawer→API→safety.accident_reports (+cost-line child)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — deep chain: accident→claim/WO/cost-line→JE both ways (cost lines under build-and-HOLD).
VERIFY-5: PASS — TRANSP + USMCA isolation; no cross-entity accident leak.
VERIFY-6: N/A→build-and-HOLD — capture is non-financial; cost-line economics route through F02/F04 poster; NO TMS→QBO write-back.
VERIFY-7: PASS — Safety leaf count unchanged.
VERIFY-8: PASS — FORCE RLS on accident_reports + cost-line child; correct GUC; security_invoker; grants; server-side scope.
MODULE_PROGRESS: safety N of M (must match docs/module-completion/safety.json AFTER this PR)
ITEMS_TOUCHED: accident-drawer-fields, accident-cost-lines-child, accident-combobox-pickers
MIGRATE: N/A if all target columns exist (confirm Step-1); else idempotent migration above BOTH 202607950000 and 202607960000 (e.g. 202607970008, distinct) adding missing accident_reports columns / cost-line child table, FORCE RLS, REVOKE DELETE, dynamic org.companies, grants, checksum-override same PR.
ROOT CAUSE: drawer fields are uncontrolled / comboboxes are no-ops / cost lines have no persistence path → payload is a 6-key subset of the rendered form.
FIX: control every field + include in payload; wire comboboxes to canonical pickers; persist cost lines as append-only FK'd children. Files: Accident drawer component, accident submit handler, cost-line writer, (if needed) migrations/202607970008_*.sql.
GUARD: scripts/verify-steps/NNN-verify-accident-drawer-wizard-depth.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 field↔column map + prod persist-and-reload proof.
REMAINING: SAF-F14/F15 (pickers) and F02/F04 (cost-line economics) are the linked dependencies; no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
