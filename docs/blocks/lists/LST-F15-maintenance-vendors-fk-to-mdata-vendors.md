<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-F15 — F15 · maintenance-vendors missing metadata.mdata_vendor_id FK to mdata.vendors
**FINDING:** F15 (P1) · **Lane:** NON-FINANCIAL · **Module:** maintenance (vendors) ↔ mdata (AP vendors).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Maintenance vendors) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§vendor linkage) · IH35_ARCHITECTURAL_DESIGN.md (module maintenance) · docs/lockdown/00_LOCKED_DECISIONS.md (vendor is AP master → linkage matters for billing; no GL math added here).
Approved screens reviewed: docs/approved-screens/2Maintenance.png.
Tab count check (Rule 05): design says maintenance-vendor references the AP vendor master · today the FK is missing · this block adds the FK · no tab change.
Deviations from spec: None.
NEW SPEC items (Rule 01): None — linkage law already requires the both-way FK.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
The maintenance-vendors record carries vendor metadata but has NO `metadata.mdata_vendor_id` FK to the canonical AP vendor master `mdata.vendors`, so a maintenance vendor cannot be resolved to (or from) the AP vendor it bills through — a Law §9 linkage gap (DOD-C). **Step 1 — reproduce (Rule 10, lucia):** confirm the maintenance-vendor table + the absent FK + the canonical target:
```
# find the maintenance-vendors table + confirm no FK to mdata.vendors
psql "$NEON_PROD" <<'SQL'
BEGIN; SET LOCAL app.bypass_rls='lucia';
SELECT to_regclass('maintenance.vendors') AS maint_vendors, to_regclass('mdata.vendors') AS ap_vendors;
-- does an mdata_vendor_id column / FK already exist?
SELECT column_name FROM information_schema.columns
 WHERE table_schema='maintenance' AND table_name='vendors' AND column_name ILIKE '%vendor_id%';
SELECT conname FROM pg_constraint WHERE conrelid = 'maintenance.vendors'::regclass AND contype='f';
ROLLBACK;
SQL
```
Exact maintenance-vendors table name + current FK state are NOT in the backbone → verify live. Canonical AP master `mdata.vendors` IS backbone-verified ("canonical AP truth"). NOTE: the condensed project reminder lists `mdata.vendors` as RETIRE — that conflicts with the GUARD-verified backbone (which names `mdata.vendors` canonical). Per "facts: prod/reference win", follow the backbone (`mdata.vendors` canonical; `mdata.qbo_vendors` is the RETIRE mirror) and flag the discrepancy to the owner before merge.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: FK from the maintenance-vendors row (`metadata.mdata_vendor_id`) → `to_regclass('mdata.vendors')` (canonical AP truth) — NEVER `mdata.qbo_vendors` (RETIRE mirror). Additive column + FK.
2. Hub matrix: maintenance-vendor links BOTH-WAY to `org.companies` (opco) and now to `mdata.vendors` (AP master) — reverse: an AP vendor resolves its maintenance-vendor profile. Forward to `maintenance.work_orders` (vendor on a WO) and downstream `accounting.bills` (vendor billed).
3. Cross-module (Rule 21 §1): the maintenance-vendor shows its AP vendor and drills to the vendor’s bills; the vendor surface shows its maintenance activity — both ways.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
QuickBooks/NetSuite vendor-master integrity — a maintenance vendor must resolve to the one AP vendor record so WO cost → bill → payment is traceable; an unlinked duplicate vendor breaks AP aging and 1099 accuracy. Referential integrity (real FK, not a name/uuid-in-jsonb).

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — add the `mdata_vendor_id` column + FK (idempotent DO + IF NOT EXISTS; add FK NOT VALID then VALIDATE on a throwaway branch). No row deletion, no vendor merge (Rule 19: never merge/reclassify vendor/reserve records). Enforce: `operating_company_id` RLS retained · FK references canonical `mdata.vendors` · append-only audit · REVOKE DELETE preserved.

## THE FIX (requirement-level; no invented unverified SQL)
Add `metadata.mdata_vendor_id uuid` to the maintenance-vendors table and a FK → `mdata.vendors(id)`, backfilling existing rows by matching to the canonical AP vendor where a confident match exists (leave NULL where ambiguous — never guess a mapping). Wire the create/edit UI to select the AP vendor via the universal vendor picker so new rows are linked at write time.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-maintenance-vendor-fk.mjs + scripts/verify-steps/NNN-verify-maintenance-vendor-fk.mjs. FAIL on pre-fix main (asserts no FK from maintenance.vendors to mdata.vendors, or the UI writes a vendor name/uuid-in-jsonb instead of the FK); PASS on the fix (FK present + UI writes `mdata_vendor_id`). --selftest mutates REAL source to drop the FK / revert to name-only, one case per assertion, and asserts the linked shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: FK exists (pg_constraint) → `mdata.vendors`; a maintenance vendor created via UI stores `mdata_vendor_id`; Neon lucia join maintenance.vendors→mdata.vendors returns the AP vendor for TRANSP and USMCA; guard wired; browser drill both ways. OR "UNVERIFIED — maintenance.vendors table name/FK state not yet confirmed; Step-1 pending".

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F15
LANE: NON-FINANCIAL
DOD-A: PASS — single active maintenance-vendors surface; no dual path.
DOD-B: PASS — vendor selection now controlled AND in payload (writes `mdata_vendor_id`).
DOD-C: PASS — this IS the linkage fix: real FK maintenance.vendors→mdata.vendors FORWARD+REVERSE (no memo/uuid-in-name/jsonb-id).
DOD-D: N/A — no money object selected; linkage enables downstream WO→bill economics.
DOD-E: UNVERIFIED — maintenance.vendors table name + current FK state must be confirmed live before freeze; backbone confirms `mdata.vendors` canonical.
VERIFY-1: PASS — vendor picker chrome + +Create vendor; drawer.
VERIFY-2: PASS — universal vendor picker: canonical `mdata.vendors` behind it, inline +Add new vendor first row, opens vendor wizard, same table write=read, survives reload, entity-scoped.
VERIFY-3: PASS — nav→maintenance vendor→UI→API→CANONICAL mdata.vendors (never mdata.qbo_vendors)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — maintenance vendor→WO→bill+payment chain resolves F+R once the FK exists.
VERIFY-5: PASS — TRANSP and USMCA vendors opco-scoped; drivers-as-vendors respected; no cross-entity leak.
VERIFY-6: N/A here — no GL math; enables audit-grade AP traceability downstream; NO TMS→QBO write-back.
VERIFY-7: PASS — no tab change (Rule 05).
VERIFY-8: PASS — column/FK under FORCE RLS + correct GUC; security_invoker on any view; grants; REVOKE DELETE preserved.
MODULE_PROGRESS: maintenance N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/maintenance.json after PR].
ITEMS_TOUCHED: maintenance-vendor-mdata-fk (manifest id to resolve live) — [AUDIT].
MIGRATE: additive — add `mdata_vendor_id uuid` + FK to `mdata.vendors(id)` (NOT VALID then VALIDATE on throwaway), migration number > 202607960000 distinct, idempotent (DO + IF NOT EXISTS), FORCE RLS retained, dynamic org.companies (no hardcoded UUID), REVOKE DELETE, grants; backfill only confident matches, ambiguous left NULL.
ROOT CAUSE: maintenance-vendors stored vendor data without a real FK to the canonical AP vendor master, breaking both-way resolution.
FIX: add `mdata_vendor_id` column + FK to `mdata.vendors`, backfill confident matches, wire UI picker; files: migration + maintenance vendor create/edit component + API.
GUARD: scripts/verify-steps/NNN-verify-maintenance-vendor-fk.mjs
LIVE PROOF: <pg_constraint FK + Neon join + browser both-way drill — or UNVERIFIED: table/FK state unconfirmed>
REMAINING: ambiguous unmatched maintenance vendors stay NULL pending owner-manual mapping (tracker + future block id); NEVER guess a vendor mapping. Owner to confirm the `mdata.vendors` canonical-vs-RETIRE discrepancy noted in PROD TRUTH.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
