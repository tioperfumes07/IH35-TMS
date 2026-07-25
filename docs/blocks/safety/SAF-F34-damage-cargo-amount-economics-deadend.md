<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F34 — F34 · damage / cargo damage_amount_cents never reaches expense/bill/claim/JE (economics dead-end)
**FINDING:** F34 (P2→P1, FIN-HOLD) · **Lane:** FINANCIAL-HOLD · **Module:** Safety (Damage / Cargo) / Accounting. **Provenance: [AUDIT — RE-VERIFY LIVE] — damage/cargo amount columns + economics are not in VERIFIED-LINKAGE-BACKBONE; Step-1 reproduces before freeze. Escalated P2→P1 because a stored money amount with no ledger is an untracked financial exposure.**

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Damage economics) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§amount→money object) · IH35_ARCHITECTURAL_DESIGN.md (module Safety + Accounting) · docs/lockdown/00_LOCKED_DECISIONS.md (posting integrity, parallel books, QBO-safe).
Approved screens reviewed: docs/approved-screens/ (Safety damage/cargo surfaces + 3AccountingDropdown.png).
Tab count check (Rule 05): no leaf change · wires damage_amount_cents to a money object · count unchanged.
Deviations from spec: the amount stored with no ledger is the deviation.
NEW SPEC items (Rule 01): None — the amount→money posting is required by spec but unwired (build-and-HOLD).

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
Damage and cargo records store `damage_amount_cents` (a real money value) but it **never reaches an expense, bill, claim, or JE** — a stored financial amount with no ledger consequence is an untracked exposure/recoverable. (Companion to SAF-F21, which is the cargo-claim render+economics; this one is the damage/cargo `damage_amount_cents` dead-end specifically.) **Step 1 — reproduce (Rule 10, lucia):** amount columns + zero-economics NOT in backbone → read live:
```
psql "$NEON_PROD" <<'SQL'
BEGIN; SET LOCAL app.bypass_rls='lucia';
SELECT table_name, column_name FROM information_schema.columns
 WHERE column_name ILIKE '%damage_amount%' OR column_name ILIKE '%amount_cents%'
   AND table_name ILIKE ANY (ARRAY['%damage%','%cargo%']);
-- prove no economics link today:
SELECT count(*) FROM accounting.expenses e WHERE e.source_ref ILIKE '%damage%'; -- expect 0
ROLLBACK;
SQL
rg -n "damage_amount_cents" app/**/safety/**   # rendered/stored but never posted
```
Classify the damage/cargo tables' scoping by opco VALUES + policy before asserting PER-ENTITY. [Amount columns + zero-economics are NOT in backbone → confirm live.]

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: `damage_amount_cents` posts to a money object in `accounting.expenses` / `accounting.bills`+`bill_lines` / `accounting.journal_entries` (backbone, RLS forced) against `catalogs.accounts` (PER-ENTITY, postable-only per LST-F14) — NEVER a RETIRE table, NEVER write `mdata.qbo_*`.
2. Hub matrix: damage/cargo → `mdata.units`/`mdata.trailers`/`mdata.loads` (reverse: equipment/load shows the damage cost) + `org.companies` (both scoped) + `accounting.journal_entries` (both-way when flag ON) + insurance claim where recoverable. Safety §10.3 both-way: damage ↔ Driver/Unit/OperatingCompany/Insurance(recovery)/Legal/Accounting(GL)/Maintenance(WO — the repair, SAF-F35).
3. Cross-module (Rule 21 §1): unit/load detail, Accounting expense/bill list, and the damage surface each show the amount's money object, drilling both ways.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
QuickBooks/NetSuite: a stored cost is a posted transaction (expense/bill or JE), and a recoverable is a receivable/insurance-claim asset — never a dangling amount. US GAAP ASC 450 (loss accrual) / recovery as separate asset. Build-and-HOLD keeps QBO authoritative (Rule 13).

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — wire the amount to a money object; no damage/cargo row altered/deleted. Enforce: operating_company_id RLS · views WITH(security_invoker=true) · append-only audit · void-not-delete · display IDs server-generated · +Book. **Financial (FIN-HOLD): Rule 13** — build-and-HOLD; reuse the poster (NO new GL math), parallel books, QBO NEVER written, flags default OFF, ASC 470-60 Ch.11 respected. **Rule 19** — reserve/holdback/retainage accounts are OWNER-MANUAL: the damage posting must never create/import/reclassify/merge/deactivate a reserve account.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = `damage_amount_cents` is captured/displayed but never routed to any money object, so a real financial amount has no ledger (untracked exposure/recoverable). Fix, under build-and-HOLD: route `damage_amount_cents` to a money object via the **existing poster** — purpose picks the object (company-borne repair cost → expense/bill; recoverable from a third party/insurer → receivable/claim JE), with NO silent default and NO new GL math. Link the repair to the maintenance WO (SAF-F35) so the cost and the work reconcile. Flags OFF by default; QBO never written; balanced JE only when flag ON; reserve accounts owner-manual (Rule 19).

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-damage-amount-economics.mjs + scripts/verify-steps/NNN-verify-damage-amount-economics.mjs (NEVER edit package.json/ci.yml/locked-guards). FAIL on pre-fix main (damage_amount_cents stored but posts to nothing), PASS on fix (amount routed to the poster, balanced when flag ON, QBO not written, reserve accounts untouched). --selftest mutates a REAL copy to drop the posting call / add unbalanced GL math / mint a reserve account, one case per assertion, and asserts the poster-reuse balanced shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, a damage record's amount (flag ON) produces a balanced money object (expense/bill/JE) via the poster, scoped to the entity, linked to the repair WO, QBO untouched, reserve accounts untouched; flag OFF = HOLD; guard green. UNVERIFIED — amount columns + poster entrypoint pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F34
LANE: FINANCIAL-HOLD
DOD-A: PASS — damage/cargo surface registered + mounted; the wired path is active; no dual path.
DOD-B: UNVERIFIED→target PASS — amount + account + counterparty fields controlled AND in the submit payload; confirm field set live.
DOD-C: UNVERIFIED→target PASS — damage ↔ unit/trailer/load + posted money object + WO FKs both ways (Law §9); no memo/jsonb.
DOD-D: PASS (build-and-HOLD) — purpose picks the money object (borne cost vs recoverable); no silent default; flags OFF.
DOD-E: UNVERIFIED — amount columns + zero-economics fact + poster entrypoint pending Step-1.
VERIFY-1: PASS — damage entry uses ParityDrawer chrome (SAF-F25); +Book; Due/box-in-box; drawer-on-drawer picker.
VERIFY-2: PASS — account picker (postable-only, LST-F14) + counterparty picker: canonical write=read, inline +Add first row, entity-scoped, survive reload.
VERIFY-3: PASS — nav→Safety damage→UI→API→canonical `accounting.*`/`catalogs.accounts` (never RETIRE, never `mdata.qbo_*`)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — deep chain: damage→money object (expense/bill/JE + payment where applicable) + repair WO (SAF-F35) + insurance recovery, all both ways.
VERIFY-5: PASS — TRANSP + USMCA post to their own entity's accounts only; no cross-entity leak.
VERIFY-6: PASS (build-and-HOLD) — audit-grade: header+lines, balanced JE when flag ON, poster reused (no new GL math), control roles honored, NO TMS→QBO write-back.
VERIFY-7: PASS — Safety leaf count unchanged (SAF-F28 reconciliation); no invented tab.
VERIFY-8: PASS — FORCE RLS + GUC + security_invoker on damage + posted objects; grants correct.
MODULE_PROGRESS: safety N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/safety.json (3 of 32) after PR; M grows per Rule 21].
ITEMS_TOUCHED: damage-amount-poster, damage-account-picker, damage-wo-link (manifest ids to resolve live) — [AUDIT].
MIGRATE: N/A if posting reuses existing tables (code-only wiring). If a damage↔money-object link column is added: idempotent additive, above both 202607950000 and 202607960000 (distinct, e.g. 202607970034), FORCE RLS, REVOKE DELETE, dynamic org.companies (no hardcoded UUID), grants, validate on throwaway only, checksum-override same PR. NEVER create/reclassify a reserve account (Rule 19).
ROOT CAUSE: damage_amount_cents is stored/displayed but never routed to any money object — a real financial amount with no ledger (untracked exposure/recoverable).
FIX: route damage_amount_cents to the existing poster under build-and-HOLD (purpose picks object, flags OFF, QBO never written, reserve accounts owner-manual), link the repair WO; files: damage/cargo surface + damage-economics wiring + WO link.
GUARD: scripts/verify-steps/NNN-verify-damage-amount-economics.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 amount-column confirm + prod balanced money object (flag ON) with QBO untouched.
REMAINING: confirm the poster entrypoint + account roles; link repair WO (SAF-F35); reserve accounts owner-manual (Rule 19); no owner-approved deferral of the HOLD.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
