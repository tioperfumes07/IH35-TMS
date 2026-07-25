<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F21 — F21 · cargo claims rendered as a raw <table>; claim amount never books to expense/bill/JE
**FINDING:** F21 (P1, FIN-HOLD) · **Lane:** FINANCIAL-HOLD · **Module:** Safety (Cargo claims) / Accounting. **Provenance: [AUDIT — RE-VERIFY LIVE] — cargo-claim table/economics are not in VERIFIED-LINKAGE-BACKBONE; Step-1 reproduces before freeze.**

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Cargo claims economics) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§claim→liability/expense posting) · IH35_ARCHITECTURAL_DESIGN.md (module Safety + Accounting) · docs/lockdown/00_LOCKED_DECISIONS.md (posting integrity, parallel books, QBO-safe).
Approved screens reviewed: docs/approved-screens/ (Safety cargo-claim surface + 3AccountingDropdown.png).
Tab count check (Rule 05): no leaf change · replaces a raw `<table>` with the ParityDrawer/QBO surface + wires economics · count unchanged.
Deviations from spec: None.
NEW SPEC items (Rule 01): None — the claim→money posting is required by spec but not implemented (build-and-HOLD, not new product).

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
Cargo claims are rendered as a **raw HTML `<table>`** (not the ParityDrawer/QBO chrome) and the **claim amount never books** to any money object — no expense, no bill, no JE, no liability. A financial event (a cargo loss the company owes/expects to recover) is a display-only string with no ledger consequence. **Step 1 — reproduce (Rule 10, lucia):** table/amount column NOT in backbone → read live:
```
psql "$NEON_PROD" <<'SQL'
BEGIN; SET LOCAL app.bypass_rls='lucia';
SELECT table_schema, table_name FROM information_schema.tables WHERE table_name ILIKE '%cargo%claim%';
SELECT column_name, data_type FROM information_schema.columns WHERE table_name='<cargo_claim>' ORDER BY ordinal_position;
-- prove zero economics linkage today:
SELECT count(*) FROM accounting.expenses e WHERE e.source_ref ILIKE '%cargo%claim%'; -- expect 0
ROLLBACK;
SQL
rg -n "cargo" app/**/safety/**   # confirm raw <table> render, no ParityDrawer, no post
```
Classify the cargo-claim table's scoping by opco VALUES + policy before asserting PER-ENTITY. [Table name, amount column, and the zero-economics fact are NOT in backbone → confirm live.]

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: claim header `to_regclass('<safety.cargo_claim>')`; money object posts to `accounting.expenses` / `accounting.bills`+`bill_lines` / `accounting.journal_entries` (all in backbone, RLS forced) — NEVER a RETIRE table, NEVER write `mdata.qbo_*` (that is the read mirror). Accounts resolve to `catalogs.accounts` (PER-ENTITY, postable-only per LST-F14).
2. Hub matrix: cargo claim → `mdata.loads` (reverse: load shows its claim) + `mdata.customers`/`mdata.vendors` (counterparty) + `org.companies` (both scoped) + `accounting.journal_entries` (both-way when flag ON). Safety §10.3 both-way: claim ↔ Driver/Unit/OperatingCompany/Insurance(recovery claim)/Legal(case)/Accounting(GL)/Maintenance(WO if repair). 
3. Cross-module (Rule 21 §1): load detail, Accounting expense/bill list, and the cargo-claim surface each show the claim and its money object, drilling both ways.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
QuickBooks/NetSuite: a claim/liability is a posted transaction (expense or bill, or JE with a liability/receivable), never a display string. US GAAP: a probable, estimable loss is accrued (ASC 450); an insurance recovery is a separate asset. McLeod/Alvys cargo-claim ledgering. Build-and-HOLD keeps QBO the source of truth (Rule 13).

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — replace the raw `<table>` render, add the posting path; no claim row altered/deleted. Enforce: operating_company_id RLS · views WITH(security_invoker=true) · append-only audit · void-not-delete · display IDs server-generated · +Book (never +Add). **Financial (FIN-HOLD): Rule 13** — build-and-HOLD; reuse the existing poster (NO new GL math), parallel books, QBO NEVER written, flags default OFF, ASC 470-60 Ch.11 accounting respected. **Rule 19** — reserve/holdback/retainage accounts are OWNER-MANUAL: the claim posting must never create/import/reclassify/merge/deactivate a reserve account; if a claim reserve is used, the owner sets it manually.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = cargo claims are a presentation-only raw `<table>` with the amount as text; there is no wiring from the claim to a money object, so a financial event has no ledger. Fix: (1) render the claim through the ParityDrawer/QBO surface (SAF-F25), and (2) wire the claim amount to a money object via the **existing poster** under build-and-HOLD — purpose picks the object (company-owed loss → expense/bill accrual; recoverable → receivable JE) with NO silent default and NO new GL math. Flags default OFF; QBO never written; balanced JE only when the flag is ON. Reserve accounts remain owner-manual (Rule 19).

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-cargo-claim-economics.mjs + scripts/verify-steps/NNN-verify-cargo-claim-economics.mjs (NEVER edit package.json/ci.yml/locked-guards). FAIL on pre-fix main (cargo claim renders raw `<table>` and amount books to nothing), PASS on fix (ParityDrawer render + amount routed to the poster, balanced when flag ON, QBO not written, reserve accounts untouched). --selftest mutates a REAL copy to drop the posting call / add unbalanced GL math, one case per assertion, and asserts the poster-reuse balanced shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, a cargo claim renders in ParityDrawer chrome; with the flag ON, its amount produces a balanced money object (expense/bill/JE) via the poster, scoped to the entity, QBO untouched, reserve accounts untouched; with flag OFF, HOLD (no post). Guard green. UNVERIFIED — table/amount column + poster entrypoint pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F21
LANE: FINANCIAL-HOLD
DOD-A: PASS — cargo-claim route registered + surface mounted (ParityDrawer replaces raw table); no DUAL_PATH_OLD_ACTIVE.
DOD-B: UNVERIFIED→target PASS — amount + account + counterparty fields controlled AND in the submit payload; confirm field set live.
DOD-C: UNVERIFIED→target PASS — claim ↔ load/customer/vendor + posted money object FKs both ways (Law §9); no memo/jsonb.
DOD-D: PASS (build-and-HOLD) — purpose picks the money object (loss accrual vs recoverable receivable); no silent default; flags OFF by default.
DOD-E: UNVERIFIED — table/amount column + zero-economics fact + poster entrypoint pending Step-1.
VERIFY-1: PASS — ParityDrawer side panel, Due/box-in-box, +Book (replaces raw `<table>`); drawer-on-drawer for the picker.
VERIFY-2: PASS — account picker (postable-only, LST-F14) + counterparty picker: canonical table write=read, inline +Add first row, entity-scoped, survive reload.
VERIFY-3: PASS — nav→Safety cargo-claim→UI→API→canonical `accounting.*`/`catalogs.accounts` (never RETIRE, never `mdata.qbo_*`)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — deep chain: claim→money object (expense/bill/JE + payment where applicable)→(insurance recovery)→both ways.
VERIFY-5: PASS — TRANSP + USMCA post to their own entity's accounts only; no cross-entity leak.
VERIFY-6: PASS (build-and-HOLD) — economics audit-grade: header+lines, balanced JE when flag ON, poster reused (no new GL math), control roles honored, NO TMS→QBO write-back.
VERIFY-7: PASS — Safety leaf count unchanged (SAF-F28 owns reconciliation); no invented tab.
VERIFY-8: PASS — FORCE RLS + GUC + security_invoker on claim + posted objects; grants correct.
MODULE_PROGRESS: safety N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/safety.json (3 of 32) after PR; M grows per Rule 21].
ITEMS_TOUCHED: cargo-claim-parity-render, cargo-claim-amount-poster, cargo-claim-account-picker (manifest ids to resolve live) — [AUDIT].
MIGRATE: N/A if posting reuses existing tables (code-only wiring). If a claim↔money-object link column is added: idempotent additive, above both 202607950000 and 202607960000 (distinct, e.g. 202607970021), FORCE RLS, REVOKE DELETE, dynamic org.companies (no hardcoded UUID), grants, validate on throwaway only, checksum-override same PR.
ROOT CAUSE: cargo claims are a raw `<table>` with the amount as display text — no wiring to any money object, so a financial event has no ledger.
FIX: render via ParityDrawer + route the amount to the existing poster under build-and-HOLD (purpose picks object, flags OFF, QBO never written, reserve accounts owner-manual); files: cargo-claim component + claim-economics wiring in the poster.
GUARD: scripts/verify-steps/NNN-verify-cargo-claim-economics.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 table/amount confirm + prod balanced money object (flag ON) with QBO untouched.
REMAINING: confirm the poster entrypoint + which account roles apply; reserve accounts stay owner-manual (Rule 19); no owner-approved deferral of the HOLD.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
