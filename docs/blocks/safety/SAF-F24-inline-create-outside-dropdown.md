<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F24 — F24 · inline-create control sits OUTSIDE the dropdown (picker-law clause 2 violation)
**FINDING:** F24 (P2) · **Lane:** NON-FINANCIAL · **Module:** Safety (pickers). **Provenance: [AUDIT — RE-VERIFY LIVE] — the offending pickers are not enumerated in VERIFIED-LINKAGE-BACKBONE; Step-1 reproduces before freeze.**

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Universal picker) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§picker-law 7 clauses) · IH35_ARCHITECTURAL_DESIGN.md (module Safety) · docs/lockdown/00_LOCKED_DECISIONS.md (N/A — UI conformance) · LST-PICKER-01-universal-picker-law.md.
Approved screens reviewed: docs/approved-screens/ (Safety picker surfaces).
Tab count check (Rule 05): no leaf change · moves the inline-create control INTO the dropdown as the first row · count unchanged.
Deviations from spec: None.
NEW SPEC items (Rule 01): None — conforms existing pickers to the picker law.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
On one or more Safety pickers the inline-create ("+Add new") control is rendered **outside the dropdown** (e.g. a separate button beside the select) instead of **as the first row inside the dropdown** — a direct violation of universal picker-law clause 2. **Step 1 — reproduce (Rule 10):** offending pickers NOT enumerated in backbone → read live:
```
# find Safety pickers whose +Add sits outside the dropdown list (read live)
rg -n "Add new|\\+Add|createInline|onCreate" app/**/safety/**
# cross-check against the picker-law component: the inline-create must be the FIRST option INSIDE the menu
rg -n "UniversalPicker|Combobox|Select" app/**/safety/**
```
Enumerate every Safety picker with the out-of-dropdown control. [The specific pickers are NOT in backbone → confirm live.]

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: each affected picker is backed by its canonical catalog/master (drivers/units/vendors/`catalogs.*`) — NEVER a RETIRE table; the inline-create writes the SAME canonical table the picker reads (write=read).
2. Hub matrix: the created record links BOTH-WAY to `org.companies` (per-entity where opco VALUES populate) and appears+selected in the picker immediately; consumers (accident/fine/claim rows) reference it via FK.
3. Cross-module (Rule 21 §1): the same picker component is reused across Safety surfaces; the inline-create behaves identically everywhere and drills both ways.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
QuickBooks "+ Add new" as the first row inside every dropdown (the picker law we match) + NetSuite inline record creation. The control must be inside the menu so create-in-context is one uninterrupted flow, not a separate button hunt.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/behavioral only — relocate the inline-create into the dropdown; no data change. Enforce: operating_company_id RLS on the backing catalogs · views WITH(security_invoker=true) · display IDs server-generated · +Create/+Add-new as FIRST ROW inside the dropdown (never a sibling button). Not financial (Rule 19 N/A).

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = the inline-create control is rendered as a sibling of the select rather than as the first row inside the dropdown menu, violating picker-law clause 2. Fix: move the inline-create into the dropdown as its first option (reusing the universal picker component per LST-PICKER-01) so create-in-context opens the QBO wizard, writes the same canonical table the picker reads, and the new value appears + is selected + survives reload. Apply to every enumerated Safety picker.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-safety-picker-inline-create-position.mjs + scripts/verify-steps/NNN-verify-safety-picker-inline-create-position.mjs (NEVER edit package.json/ci.yml/locked-guards). FAIL on pre-fix main (a Safety picker's inline-create is outside the dropdown), PASS on fix (inline-create is the first row inside the dropdown, write=read, survives reload). --selftest mutates a REAL picker copy to move +Add outside the menu, one case per assertion, and asserts the inside-first-row shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, every Safety picker shows "+Add new" as the first row inside the dropdown; creating from there opens the wizard, writes the canonical table, and the new option appears+selected+survives reload; guard green. UNVERIFIED — the offending picker set pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F24
LANE: NON-FINANCIAL
DOD-A: PASS — the pickers are on registered/mounted Safety surfaces; corrected picker is the active path; no dual path.
DOD-B: PASS — the picker value + any inline-create fields are controlled AND in the submit payload.
DOD-C: PASS — inline-created record exposes canonical FKs FORWARD+REVERSE; no memo/uuid-in-name.
DOD-D: N/A — no money object.
DOD-E: UNVERIFIED — the offending picker set must be enumerated live before freeze.
VERIFY-1: PASS — picker uses ParityDrawer/QBO chrome; inline-create opens the wizard (drawer-on-drawer).
VERIFY-2: PASS — all 7 picker-law clauses, especially clause 2: inline +Add new is the FIRST ROW inside the dropdown; catalog behind it; same canonical table write=read; appears+selected+survives reload; entity-scoped.
VERIFY-3: PASS — nav→Safety→UI→API→canonical catalog/master (never RETIRE)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — created record drills both ways into the consuming Safety record.
VERIFY-5: PASS — TRANSP + USMCA each create into their own entity's catalog; no cross-entity leak.
VERIFY-6: N/A — no economics; NO TMS→QBO write-back.
VERIFY-7: PASS — Safety leaf count unchanged; no invented tab.
VERIFY-8: PASS — FORCE RLS + GUC + security_invoker on the backing catalogs; grants correct.
MODULE_PROGRESS: safety N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/safety.json (3 of 32) after PR; M grows per Rule 21].
ITEMS_TOUCHED: safety-picker-inline-create-position (per enumerated picker; manifest ids to resolve live) — [AUDIT].
MIGRATE: N/A — client picker-composition change; no DDL/DML.
ROOT CAUSE: inline-create control rendered as a sibling button beside the select instead of the first row inside the dropdown — picker-law clause 2 violation.
FIX: relocate inline-create into the dropdown as first row via the universal picker component; files: enumerated Safety picker components.
GUARD: scripts/verify-steps/NNN-verify-safety-picker-inline-create-position.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 picker enumeration + browser proof of first-row inline-create.
REMAINING: enumerate every Safety picker with the out-of-dropdown control; no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
