<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F16 — F16 · Driver detail has no fines/complaints/D&A reverse section (Rule 21 both-way)
**FINDING:** F16 (P1, no FIN-HOLD) · **Lane:** NON-FINANCIAL (reverse-linkage display; surfaced records carry their own FIN-HOLD) · **Module:** Safety ↔ Driver detail.

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Driver detail · §Safety linkage) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Rule 21 both-way §10.3) · IH35_ARCHITECTURAL_DESIGN.md (module Driver/Safety) · docs/lockdown/00_LOCKED_DECISIONS.md
Approved screens reviewed: docs/approved-screens/7Drivers.png · docs/approved-screens/safety.png
Tab count check (Rule 05): design says N Driver-detail leaves · this block changes count to N (adds a Safety reverse section/leaf — if it changes the count, the approved Driver screen is updated in the SAME commit; else it is a section within an existing leaf, count unchanged). Coder confirms against docs/approved-screens/7Drivers.png.
Deviations from spec: None.
NEW SPEC items (Rule 01): None — Rule 21 requires the reverse view; not new scope.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
The Driver detail page has NO reverse section for that driver's fines, complaints, or drug & alcohol records — so a safety event links forward (event→driver) but the driver does not drill back to its events (Rule 21 both-way violation). An operator on the driver page cannot see the driver's fines/complaints/D&A history. **Step 1 — reproduce (Rule 10, lucia):** (a) open a driver in Driver detail; confirm there is no fines/complaints/D&A section. (b) Confirm the reverse FKs exist to query: `SET app.bypass_rls='lucia'; SELECT column_name FROM information_schema.columns WHERE table_schema='safety' AND table_name IN ('civil_fines','complaints','drug_alcohol_tests') AND column_name='driver_id';` (do not assume names — not in backbone; note F02/F03 held-column drift). Prod branch br-fancy-credit-akjnd07a wins.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: the reverse section READS canonical `safety.civil_fines` / `safety.complaints` / `safety.drug_alcohol_tests` filtered by `driver_id` = the current driver [AUDIT — confirm FKs live]; NEVER a RETIRE table, NEVER a denormalized copy.
2. Hub matrix (both-way): driver (`mdata.drivers`) ← fines/complaints/D&A (reverse) — this block IS the reverse leg; forward legs live in SAF-F02/F03/F11/F12/F13. Entity-scoped via `org.companies`.
3. Cross-module (Rule 21 §1) — Safety §10.3: Driver detail surfaces the driver's safety events with drill-through to each event (and its money, via the event's FIN-HOLD blocks). Completes both-way for fines/complaints/D&A.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
McLeod/Alvys driver profile = a 360° view including violations, complaints, and D&A history; NetSuite record-with-related-lists both-way navigation. Rule 21: every module/tab links both ways.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — a read-only reverse section; no data change. Enforce: operating_company_id RLS on the source tables (the section inherits entity scope) · views WITH(security_invoker=true) · no cross-entity leak · display IDs server-generated. Non-financial display — Rule 13/19 apply to the underlying money records, not this view; the view never posts.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = the Driver detail lacks the reverse read for fines/complaints/D&A. Fix: add a Safety reverse section on Driver detail that queries the canonical safety tables by the current `driver_id`, entity-scoped, with drill-through to each record; show counts + status; each row links to its source (and, for money records, to its FIN-HOLD detail). Read-only; write-path stays in the event's own block. If a driver_id reverse FK is missing on a source table, that is corrected in the forward block (F02/F03), not here.

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-driver-safety-reverse-section.mjs` + `scripts/verify-steps/NNN-verify-driver-safety-reverse-section.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (Driver detail has no fines/complaints/D&A reverse section, or it is not entity-scoped), PASSes on fix (section present, reads canonical tables by driver_id, entity-scoped, drills through). `--selftest` mutates a real Driver-detail copy to drop the section, asserts flagged; asserts the present shape not flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, a driver with fines/complaints/D&A shows them in the reverse section, drills to each, entity-scoped (no cross-entity rows); guard green. UNVERIFIED — Driver-detail component + reverse FKs pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F16
LANE: NON-FINANCIAL
DOD-A: FAIL→PASS — Driver detail (active) gains the reverse section; no DUAL_PATH_OLD_ACTIVE twin.
DOD-B: N/A (read view) — no submit payload; drill-through links resolve.
DOD-C: FAIL→PASS — driver ↔ fines/complaints/D&A both ways (this block adds the REVERSE leg via real driver_id FK); no memo/uuid-in-name/jsonb.
DOD-D: N/A — non-financial display; money detail lives in the linked FIN-HOLD blocks.
DOD-E: UNVERIFIED — Driver-detail component + reverse FKs pending Step-1.
VERIFY-1: PASS — reverse section in QBO chrome (related-list style); drill both ways.
VERIFY-2: N/A — read view, no picker.
VERIFY-3: PASS — nav→Driver detail→reverse section→API→canonical safety tables by driver_id (never RETIRE)→entity-scoped→flags honest.
VERIFY-4: PASS — deep chain: driver↔fine↔JE/deduction; driver↔complaint; driver↔D&A↔qualification gate; all navigable both ways.
VERIFY-5: PASS — TRANSP + USMCA isolation; only in-entity records shown; no cross-entity leak.
VERIFY-6: N/A — non-financial; NO TMS→QBO write-back.
VERIFY-7: PASS — Driver-detail leaf/section per approved screen; design updated same commit if count changes (Rule 05).
VERIFY-8: PASS — FORCE RLS on source tables; correct GUC; security_invoker views; grants.
MODULE_PROGRESS: safety N of M (must match docs/module-completion/safety.json AFTER this PR; also reflect on driver module completion)
ITEMS_TOUCHED: driver-detail-safety-reverse-section, fines-reverse, complaints-reverse, da-reverse
MIGRATE: N/A — read-only view; no DDL (reverse FKs belong to the forward blocks F02/F03).
ROOT CAUSE: Driver detail has no reverse section for fines/complaints/D&A → Rule 21 both-way linkage incomplete.
FIX: add an entity-scoped, read-only Safety reverse section on Driver detail querying canonical safety tables by driver_id with drill-through. Files: Driver detail page, safety reverse-section components, reverse query API.
GUARD: scripts/verify-steps/NNN-verify-driver-safety-reverse-section.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 component reproduce + prod reverse-section proof.
REMAINING: depends on F02/F03 applied driver_id FKs (fines/deductions) + F06 (D&A reachable); no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
