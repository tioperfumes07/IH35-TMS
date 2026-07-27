# ACCT-R-36 — AF-4-ap-bills-migration · AF 4 ap bills migration
**FINDING:** ACCT-R-36 / pile `AF-4-ap-bills-migration` (P0, OWNER) · **Lane:** OWNER-GATE · **Module:** accounting.
**Pile source:** `docs/trackers/block-audit-piles-2026-07-21.json` post-purge 2026-07-25 · **pile:** `NEEDS-OWNER` · **status_reconcile:** `PENDING (GATED)`.

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: docs/specs/CURSOR-PERMANENT-RULES.md · docs/specs/IH35_MASTER_BLUEPRINT_v3_FULL.md (module accounting) · docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md · docs/specs/IH35_ARCHITECTURAL_DESIGN.md (module accounting) · docs/lockdown/00_LOCKED_DECISIONS.md (if financial) · docs/specs/LAW-OF-THE-LAND-COMPLETE-2026-07-25.md (index; source rule wins on conflict)
Approved screens reviewed: docs/approved-screens/3AccountingDropdown.png · docs/approved-screens/10Reports.png
Tab count check (Rule 05): design says N tabs for accounting · this block changes count to same N unless Fix explicitly adds a design-approved leaf (then update design same commit)
Deviations from spec: None expected — if Fix invents a leaf/tab, STOP and get Jorge NEW-SPEC approval (Rule 01)
NEW SPEC items (Rule 01): <None | list — needs Jorge approval before build>

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
PENDING (GATED) — gated on owner decision/HELD gate — [verified 2026-07-03] ~$1.18M A/P migration not executed (Tier-1 held)

**Step 1 — reproduce (Rule 10, lucia):** Re-run the claim on Neon `br-fancy-credit-akjnd07a` with `BEGIN; SELECT set_config('app.bypass_rls','lucia',true); … ROLLBACK;` and/or click-through on live app for TRANSP **and** USMCA. Classify scoping by opco VALUES + policy, never column presence. A `0` on FORCED-RLS tables is not absence until lucia re-run. **Do not freeze PASS without this Step-1.**

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: `accounting.bills / accounting.bill_lines` — verify `to_regclass` on prod before write/FK.
2. Hub matrix: declare BOTH-WAY links to applicable hubs among org.companies · identity.users · mdata.drivers/units/loads/customers/vendors · catalogs.accounts · maintenance.work_orders · accounting.journal_entries.
3. Cross-module (Rule 21 §1): every module/tab this touches must show it and drill both ways.
4. Deployed SHA vs origin/main: <coder fills at build — `/api/v1/healthz/shallow` version>.

## STANDARD (Rule 15 — cite what we match/surpass)
QuickBooks / NetSuite controls + McLeod/Alvys ops seriousness + US GAAP/ASC (470-60 Ch.11, 606, 842 as applicable) + RLS/WORM/security_invoker. Name the exact standard this Fix matches in the PR body.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — no DROP/DELETE/TRUNCATE of modules/tabs/surfaces/columns with history; archive/void/deactivate. Enforce: operating_company_id RLS · security_invoker views · lockstep INSERT · append-only audit · void-not-delete · idempotent migration (DO + IF NOT EXISTS) · display IDs server-generated · +Create/+Book never +New/+Add · production never serves fake data.

**OWNER-GATE:** Do NOT build product code until Jorge writes the decision. This file is the decision packet + acceptance shape only.

## THE FIX (requirement-level; no invented unverified SQL)
Root-cause Fix for `AF-4-ap-bills-migration` — not a patch:
1. Re-verify Step-1 live (lucia / browser).
2. Implement the missing wiring / UI / guard / migration **only if** still open after Step-1.
3. Bind to module-completion: either map to an existing FAIL/UNVERIFIED id, or grow M honestly (Rule 21) with a new id — never fake N.
4. If OWNER-GATE: capture Jorge decision in `IH35_UNIFIED_BLUEPRINT_ADDITIONS.md` same commit as any unlock.

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-af-4-ap-bills-migration.mjs` + `scripts/verify-steps/NNN-verify-….mjs` (NEVER edit package.json / ci.yml / locked-guards.yml). FAIL on the pre-fix bug, PASS on the fix; `--selftest` mutates REAL source. One assertion per case.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: file+route mounted + column populated 0-NULL (where applicable) + guard wired + browser/endpoint + Neon lucia — OR `UNVERIFIED — <named blocker>`. OWNER-GATE acceptance = written Jorge decision + tracker update (no silent build).

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: ACCT-R-36
LANE: DOCS
DOD-A: UNVERIFIED — active path proof at build
DOD-B: N/A — owner decision packet
DOD-C: UNVERIFIED — F+R linkage at build (memo/uuid-in-name/jsonb-ids = FAIL)
DOD-D: UNVERIFIED — purpose→economics if money
DOD-E: UNVERIFIED — Step-1 not yet re-run in this packet
VERIFY-1: N/A
VERIFY-2: N/A
VERIFY-3: UNVERIFIED — nav→route→UI→API→CANONICAL→entity-scoped→flags honest
VERIFY-4: UNVERIFIED — deep F+R where applicable
VERIFY-5: UNVERIFIED — TRANSP AND USMCA
VERIFY-6: N/A or UNVERIFIED
VERIFY-7: PASS target — no invented tabs; design same-commit if count changes
VERIFY-8: UNVERIFIED — FORCE RLS + GUC + security_invoker + grants
MODULE_PROGRESS: accounting 8 of 25 (M may grow if this FAIL is new leaf — Rule 21)
ITEMS_TOUCHED: AF-4-ap-bills-migration
MIGRATE: N/A until owner unlock
ROOT CAUSE: AF-4-ap-bills-migration still open after 2026-07-25 Acct+Bank pile purge (not duplicate/wrong-module/BUILT).
FIX: <root fix files — coder fills>
GUARD: scripts/verify-steps/NNN-…
LIVE PROOF: UNVERIFIED — Step-1 reproduce required before any PASS claim
REMAINING: owner written decision required before build

---
## ALL-24-RULE COMPLIANCE
Bound by `.cursor/rules/00–24` + dual-lane-never-idle + COMPLIANCE-STANDARD-2026-07-25.md. Cursor builds; Claude merges; no Neon-apply by agent; no flag flips without OWNER; Rule 23 no money theater.
