<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F23 — F23 · escrow tab has no GL / settlement / bank / liability link
**FINDING:** F23 (P1, FIN-HOLD) · **Lane:** FINANCIAL-HOLD · **Module:** Safety (Escrow tab) / Accounting / Driver settlement. **Provenance: [AUDIT — RE-VERIFY LIVE] — escrow table/economics are not in VERIFIED-LINKAGE-BACKBONE; Step-1 reproduces before freeze.**

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Driver escrow / liability) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§escrow→liability account, settlement, bank) · IH35_ARCHITECTURAL_DESIGN.md (module Safety + driver_finance) · docs/lockdown/00_LOCKED_DECISIONS.md (parallel books, reserve/holdback = owner-manual, QBO-safe).
Approved screens reviewed: docs/approved-screens/7Drivers.png + 3AccountingDropdown.png (escrow surface — confirm exact PNG live).
Tab count check (Rule 05): no leaf change · wires the escrow tab to GL/settlement/bank/liability · count unchanged.
Deviations from spec: None.
NEW SPEC items (Rule 01): None — escrow economics is required by spec but unwired (build-and-HOLD).

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
The escrow tab tracks driver escrow balances but has **no GL, no settlement, no bank, and no liability link** — escrow (money the company holds on a driver's behalf, a liability) is a display balance with no ledger, no settlement deduction/refund path, no bank movement, and no liability account. **Step 1 — reproduce (Rule 10, lucia):** escrow table/columns NOT in backbone → read live; canonical driver-finance schema is `driver_finance.*` (backbone RETIRE note: never `payroll.*`/`settlement.*`):
```
psql "$NEON_PROD" <<'SQL'
BEGIN; SET LOCAL app.bypass_rls='lucia';
SELECT table_schema, table_name FROM information_schema.tables WHERE table_name ILIKE '%escrow%' ORDER BY 1,2;
SELECT column_name, data_type FROM information_schema.columns WHERE table_name='<escrow>' ORDER BY ordinal_position;
-- prove no liability/JE link today:
SELECT count(*) FROM accounting.journal_entries je WHERE je.source_ref ILIKE '%escrow%'; -- expect 0
ROLLBACK;
SQL
rg -n "escrow" app/**/safety/** app/**/drivers/**
```
Classify the escrow table's scoping by opco VALUES + policy before asserting PER-ENTITY. [Table name, columns, and the zero-link fact are NOT in backbone → confirm live.]

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: escrow ledger under `driver_finance.*` (canonical; NEVER `payroll.*`/`settlement.*` — RETIRE per backbone); liability posts to `accounting.journal_entries` against a **driver-escrow liability account** in `catalogs.accounts` (PER-ENTITY); bank movement to `banking.bank_transactions` (NEVER `bank.*`). 
2. Hub matrix: escrow → `mdata.drivers` (reverse: driver shows escrow balance) + `driver_finance.*` settlement (reverse: settlement shows escrow deduction/refund) + `org.companies` (both scoped) + `accounting.journal_entries` (liability, both-way when flag ON) + `banking.bank_transactions` (when cash moves). Safety §10.3 both-way where escrow is safety-driven (damage holdback): escrow ↔ Driver/Unit/OperatingCompany/Accounting(GL liability)/Legal(if disputed).
3. Cross-module (Rule 21 §1): driver profile, settlement run, bank reconciliation, and the escrow tab each show the escrow movement, drilling both ways.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
QuickBooks/NetSuite: money held for another party is a **liability** (escrow payable), posted, reconciled to bank, and cleared through settlement — never a display-only balance. McLeod/Alvys driver-escrow ledger. US GAAP: escrow is not revenue; it is a liability until earned/refunded. Build-and-HOLD keeps QBO authoritative (Rule 13).

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — wire the escrow tab to its ledger/liability/settlement/bank; no escrow row altered/deleted. Enforce: operating_company_id RLS · views WITH(security_invoker=true) · append-only audit · void-not-delete · display IDs server-generated · +Book. **Financial (FIN-HOLD): Rule 13** — build-and-HOLD; reuse the poster (NO new GL math); parallel books; QBO NEVER written; flags default OFF. **Rule 19** — the driver-escrow **liability/holdback account is OWNER-MANUAL**: never create/import/reclassify/merge/deactivate it; the wiring references the owner-set account, it does not mint one.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = the escrow tab persists a balance but is not wired to any accounting/settlement/bank/liability primitive, so a liability the company holds has no ledger and no clearing path. Fix, under build-and-HOLD: (1) post escrow additions/releases as a liability JE against the owner-set escrow liability account via the **existing poster** (no new GL math, no minted account — Rule 19); (2) link escrow deductions/refunds to the driver settlement run (`driver_finance.*`); (3) link the cash side to `banking.bank_transactions` for reconciliation; (4) surface the balance both-way on the driver profile. Flags OFF by default; QBO never written; balanced JE only when flag ON.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-escrow-liability-settlement-bank-link.mjs + scripts/verify-steps/NNN-verify-escrow-liability-settlement-bank-link.mjs (NEVER edit package.json/ci.yml/locked-guards). FAIL on pre-fix main (escrow tab has no JE/liability-account/settlement/bank link, or mints a reserve account), PASS on fix (escrow posts to owner-set liability account via poster, links settlement + bank, balanced when flag ON, QBO untouched, no minted account). --selftest mutates a REAL copy to drop the liability post / mint an account, one case per assertion, and asserts the owner-manual-account + poster-reuse shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, an escrow addition posts a balanced liability JE (flag ON) against the owner-set escrow liability account, links to the driver's settlement and to a bank transaction, drills both ways from the driver profile; QBO untouched; no account minted; flag OFF = HOLD. Guard green. UNVERIFIED — escrow table/columns + owner-set liability account id pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F23
LANE: FINANCIAL-HOLD
DOD-A: PASS — escrow tab route registered + mounted; wired surface is the active path; no DUAL_PATH_OLD_ACTIVE.
DOD-B: UNVERIFIED→target PASS — amount/account/driver/settlement fields controlled AND in submit payload; confirm field set live.
DOD-C: UNVERIFIED→target PASS — escrow ↔ driver/settlement/JE/bank FKs both ways (Law §9); no memo/jsonb.
DOD-D: PASS (build-and-HOLD) — purpose picks the money object (escrow liability vs release/refund); no silent default; flags OFF.
DOD-E: UNVERIFIED — escrow table/columns + zero-link fact + owner liability account pending Step-1.
VERIFY-1: PASS — escrow entry uses ParityDrawer chrome (SAF-F25); +Book; Due/box-in-box; drawer-on-drawer picker.
VERIFY-2: PASS — escrow liability account picker (postable-only, owner-set) + driver picker: canonical write=read, entity-scoped, survive reload; +Add first row (but reserve/liability account NOT mintable here — owner-manual, Rule 19).
VERIFY-3: PASS — nav→Safety/Driver escrow→UI→API→canonical `driver_finance.*`/`accounting.journal_entries`/`banking.bank_transactions`/`catalogs.accounts` (never RETIRE `payroll.*`/`settlement.*`/`bank.*`)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — deep chain: escrow→liability JE→settlement deduction/refund→bank transaction, all both ways.
VERIFY-5: PASS — TRANSP + USMCA each post to their own entity's escrow liability account; drivers-as-vendors where relevant; no cross-entity leak.
VERIFY-6: PASS (build-and-HOLD) — audit-grade: escrow as liability, balanced JE when flag ON, poster reused, control roles honored, NO TMS→QBO write-back; reserve/liability account owner-manual (Rule 19).
VERIFY-7: PASS — Safety/Driver leaf count unchanged (SAF-F28 reconciliation); no invented tab.
VERIFY-8: PASS — FORCE RLS + GUC + security_invoker on escrow + JE + bank; grants correct.
MODULE_PROGRESS: safety N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/safety.json (3 of 32) after PR; M grows per Rule 21].
ITEMS_TOUCHED: escrow-liability-poster, escrow-settlement-link, escrow-bank-link, escrow-driver-both-way (manifest ids to resolve live) — [AUDIT].
MIGRATE: N/A if wiring reuses existing tables (code-only). If an escrow↔JE/settlement/bank link column is added: idempotent additive, above both 202607950000 and 202607960000 (distinct, e.g. 202607970023), FORCE RLS, REVOKE DELETE, dynamic org.companies (no hardcoded UUID), grants, validate on throwaway only, checksum-override same PR. NEVER create/reclassify the escrow liability account (Rule 19).
ROOT CAUSE: escrow tab persists a balance with no link to any accounting/settlement/bank/liability primitive — a company-held liability has no ledger and no clearing path.
FIX: post escrow as a liability via the existing poster against the owner-set liability account, link settlement + bank, surface both-way on the driver; files: escrow surface + escrow-economics wiring + settlement/bank links.
GUARD: scripts/verify-steps/NNN-verify-escrow-liability-settlement-bank-link.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 escrow table/columns + owner liability account + prod balanced liability JE with QBO untouched.
REMAINING: owner sets/confirms the escrow liability account (Rule 19); confirm the settlement run + bank reconciliation entrypoints; no owner-approved deferral of the HOLD.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
