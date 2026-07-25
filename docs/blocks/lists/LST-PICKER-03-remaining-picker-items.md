<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-PICKER-03 — PICKER-03 · remaining picker items per manifest → inline-create coverage
**FINDING:** PICKER-03 (P2, no FIN-HOLD) · **Lane:** NON-FINANCIAL (financial catalog instances stay under their own FIN-HOLD blocks) · **Module:** Lists & Catalogs (cross-cutting, manifest-driven).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Picker manifest) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Inline-create coverage) · IH35_ARCHITECTURAL_DESIGN.md (module Lists/shared components) · docs/lockdown/00_LOCKED_DECISIONS.md (picker law)
Approved screens reviewed: docs/approved-screens/9Lists_and_catalogs.png
Tab count check (Rule 05): design says N tabs · this block changes count to same N (inline-create coverage — no leaf change)
Deviations from spec: None
NEW SPEC items (Rule 01): None

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
Finding: after PICKER-01 establishes the shared capability and PICKER-02/F06 fixes item/expense-category source, a remaining set of catalog pickers per the picker manifest still lack inline-create ("+Add new" first row → create wizard → write=read) coverage. This block closes that leftover set to the universal picker law (LST-PICKER-01, all 7 clauses). The specific leftover picker list is defined by the manifest, not the backbone. **Step 1 — reproduce (Rule 10, lucia):** enumerate the picker manifest; for each entry, check the client picker for inline-create-as-first-row + write=read against its canonical `catalogs.<t>` (`SET app.bypass_rls='lucia'; SELECT count(*) FROM catalogs.<t>;`); the entries missing inline-create are PICKER-03's scope. [Manifest leftover set → confirm on origin/main.]

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: each leftover picker binds to its canonical `catalogs.<table>` (per backbone/manifest) — NEVER a RETIRE table (no `mdata.qbo_*` read source).
2. Hub matrix: each catalog value → `org.companies` (entity-scoped, both-way) + its consuming record both ways via real FK.
3. Cross-module (Rule 21 §1): every module rendering a leftover picker gains inline-create via the shared capability; drill both ways value↔consumer.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
QuickBooks "+ Add new" everywhere: no catalog picker should force the user to leave the flow to create a missing value. Full inline-create coverage across every manifest picker matches the QBO/NetSuite baseline.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive — no DROP/DELETE/TRUNCATE; pickers gain inline-create via config, catalog data untouched. Enforce: operating_company_id RLS on every catalog · views WITH(security_invoker=true) · append-only audit on inline create · display IDs server-generated · +Create/+Book never +New/+Add. Financial catalog instances retain their own FIN-HOLD (Rule 13/19); this block must not bypass is_postable (F14) / control-role (F09) / canonical-source (F06) rules where a leftover picker is financial.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = a manifest-defined set of catalog pickers still lacks inline-create coverage after PICKER-01/02. Fix: for each leftover manifest picker, wire it to the shared picker capability (LST-PICKER-01) with its per-catalog config so inline "+Add new" (first row → create wizard → same canonical table write=read → appears+selected+survives reload → entity-scoped) works. Config-only per catalog; no bespoke forms. Financial leftover pickers pass their predicates via config.

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-picker-manifest-inline-create.mjs` + `scripts/verify-steps/NNN-verify-picker-manifest-inline-create.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (a manifest picker lacks inline-create / write≠read), PASSes on fix (every manifest picker has inline-create via the shared capability, all 7 clauses). `--selftest` mutates a real leftover picker copy to drop inline-create, asserts flagged; asserts covered picker not flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: for each leftover manifest picker, in TRANSP + USMCA: inline "+Add new" first row creates + selects + survives reload against the canonical entity-scoped table; guard green; manifest fully covered. UNVERIFIED — leftover manifest set until Step-1 reproduce on origin/main.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: PICKER-03
LANE: NON-FINANCIAL
DOD-A: PASS — each leftover picker mounted on its live catalog route via the shared capability; no DUAL_PATH_OLD_ACTIVE twin.
DOD-B: PASS — inline-create fields controlled AND in the create submit payload for every covered picker.
DOD-C: PASS — value ↔ org.companies + consumer FKs both ways via real FK; no memo/uuid-in-name/jsonb.
DOD-D: N/A (coverage) — economic selection stays in consuming blocks; financial leftover pickers keep their own money-object logic (F06/F09/F14).
DOD-E: UNVERIFIED — leftover manifest set pending Step-1 origin/main confirm; canonical tables + 7-clause spec verified.
VERIFY-1: PASS — covered pickers render QBO chrome (inline first-row +Add, create wizard drawer).
VERIFY-2: PASS — every covered picker satisfies all 7 clauses via the shared capability (catalog behind it · inline +Add first row · opens QBO wizard · same canonical table write=read · appears+selected+survives reload · entity-scoped).
VERIFY-3: PASS — nav→covered picker→UI→API→canonical `catalogs.<t>` (never RETIRE)→same R/W→entity-scoped→flags honest.
VERIFY-4: N/A (coverage-level) — economic chains verified in consuming financial blocks.
VERIFY-5: PASS — every covered picker entity-scoped; TRANSP+USMCA isolation; no cross-entity leak; no mirror read.
VERIFY-6: N/A (non-financial coverage) — financial pickers route economics through their own FIN-HOLD blocks; no TMS→QBO write-back here.
VERIFY-7: PASS — leaf counts unchanged across affected modules; no invented tab.
VERIFY-8: PASS — FORCE RLS + GUC enforced per covered picker via config; security_invoker views; grants correct; server-side scoping.
MODULE_PROGRESS: lists-catalogs N of M (must match docs/module-completion/lists-catalogs.json AFTER this PR)
ITEMS_TOUCHED: <leftover manifest picker config ids from Step-1 inventory>
MIGRATE: N/A — config/refactor to the shared capability; no DDL (canonical tables already exist per backbone). Any picker-view swap is idempotent, above 202607960000, checksum-override same PR.
ROOT CAUSE: a manifest-defined set of catalog pickers still lacks inline-create coverage after PICKER-01/02.
FIX: wire each leftover manifest picker to the shared picker capability with per-catalog config for full inline-create coverage. Files: per-catalog picker configs + shared capability + server picker API.
GUARD: scripts/verify-steps/NNN-verify-picker-manifest-inline-create.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 leftover-manifest enumeration + prod inline-create proof per covered picker.
REMAINING: leftover manifest set is the first live step; financial leftover pickers carry their own FIN-HOLD proofs; no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
