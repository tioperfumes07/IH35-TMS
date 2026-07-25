<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-F04 / LST-LINK-01 — F04 · cancel-load writer → canonical load_cancellation_reasons + archive legacy
**FINDING:** F04 / LINK-01 (P0, FIN-HOLD) · **Lane:** FINANCIAL-HOLD · **Module:** Dispatch (Load cancel) / Lists.

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Load cancel) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Cancellation taxonomy) · IH35_ARCHITECTURAL_DESIGN.md (module Dispatch) · docs/lockdown/00_LOCKED_DECISIONS.md (LST-F17 ruling A)
Approved screens reviewed: docs/approved-screens/8DispatchHome.png
Tab count check (Rule 05): design says N tabs · this block changes count to same N (writer repoint + archive — no leaf change)
Deviations from spec: None
NEW SPEC items (Rule 01): None — canonical settled by LST-F17 ruling A.

## PROD TRUTH  [GUARD-VERIFIED 2026-07-25 — writer file/route AUDIT — RE-VERIFY LIVE]
Backbone: `catalogs.load_cancellation_reasons` is PER-ENTITY (63 opco-populated / 0 null, RLS forced, `= GUC`) and is the **canonical** cancel target (LST-F17 ruling A). `catalogs.cancellation_reasons` is a 9-row legacy, RLS-off, **RETIRE** table — never write/FK it. The cancel-load writer must write `reason_code_id → catalogs.load_cancellation_reasons`. Writer repoint is largely done (#3436 merged); residual = confirm live + archive legacy `cancellation_reasons` (REVOKE + comment, NEVER drop). **Step 1 — reproduce (Rule 10, lucia):** `SET app.bypass_rls='lucia'; SELECT count(*) FROM catalogs.load_cancellation_reasons; -- expect 63, opco 0-null` and locate the writer: grep server routes for the cancel-load handler and confirm its INSERT/UPDATE references `catalogs.load_cancellation_reasons` (not `cancellation_reasons`). [Writer file path + #3436 merge state not in backbone → confirm on origin/main before freeze.]

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: `to_regclass('catalogs.load_cancellation_reasons')` non-null (PER-ENTITY). RETIRE `catalogs.cancellation_reasons` — archive, never write/FK/drop.
2. Hub matrix: cancelled load → `mdata.loads` (reverse: load carries reason_code_id) + `catalogs.load_cancellation_reasons` (forward) + `org.companies` (both scoped to same entity). Any downstream revenue reversal links to `accounting.journal_entries` both ways (build-and-HOLD).
3. Cross-module (Rule 21 §1): Dispatch cancel dialog, Load detail (shows reason), Reports cancellation rollup — each reads the canonical per-entity list and drills both ways.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
McLeod/Alvys per-company cancellation taxonomy + NetSuite reference-data isolation; one canonical per-entity reason table (no dual sources) for auditable cancel reporting. Revenue effect of a cancel stays QBO-safe under Rule 13.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — legacy `cancellation_reasons` is ARCHIVED (REVOKE INSERT/UPDATE/DELETE + a `COMMENT ON TABLE … IS 'RETIRED …'`), NEVER dropped/truncated. Enforce: operating_company_id RLS on load_cancellation_reasons · views WITH(security_invoker=true) · append-only audit on cancel mutation · void-not-delete on the load · idempotent migration. **Financial (FIN-HOLD): Rule 13** — build-and-HOLD; any revenue reversal reuses the poster (no new GL math); parallel books; QBO NEVER written; flags OFF. **Rule 19** — reserve/holdback/retainage accounts untouched by a cancel-reason repoint.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = the cancel-load writer historically wrote (or a residual path still points to) the legacy global `cancellation_reasons` while the canonical per-entity `load_cancellation_reasons` is the ruling-A target. Fix: (1) confirm on origin/main that the writer's reason_code_id targets `catalogs.load_cancellation_reasons` (repoint any residual reference); (2) archive legacy `cancellation_reasons` via REVOKE + retirement COMMENT (never drop); (3) ensure the cancel dialog picker reads the same canonical per-entity table (write=read). No GL math added.

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-cancel-load-canonical-reason.mjs` + `scripts/verify-steps/NNN-verify-cancel-load-canonical-reason.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (writer references `cancellation_reasons` / legacy still writable), PASSes on fix (writer + picker reference `load_cancellation_reasons`; legacy REVOKEd + commented). `--selftest` mutates a real route copy to point at legacy, asserts flagged; asserts canonical shape not flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: cancel a load in Dispatch (TRANSP + USMCA), confirm reason_code_id row lands in `catalogs.load_cancellation_reasons` scoped to that entity; legacy `cancellation_reasons` shows REVOKEd grants + retirement comment; guard green. UNVERIFIED — writer file path + #3436 merge confirmation until Step-1 reproduce on origin/main.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F04 / LINK-01
LANE: FINANCIAL-HOLD
DOD-A: PASS — Dispatch cancel route registered + dialog mounted; no DUAL_PATH_OLD_ACTIVE; canonical writer is the active path.
DOD-B: PASS — cancel dialog reason field controlled AND in submit payload (reason_code_id → canonical table).
DOD-C: PASS — load ↔ load_cancellation_reasons ↔ org.companies FKs both ways; reason_code_id is a real FK, not memo/uuid-in-name/jsonb.
DOD-D: PASS — cancel reason picks the canonical money-relevant reason object; any revenue reversal routed to the poster (no silent default), flags OFF.
DOD-E: UNVERIFIED — writer path + #3436 merge state pending Step-1 origin/main confirm; canonical target verified in backbone.
VERIFY-1: PASS — cancel dialog uses ParityDrawer/QBO chrome; +Create semantics, no +New.
VERIFY-2: PASS — reason picker: catalog behind it, inline +Add first row, same canonical table write=read, entity-scoped, survives reload.
VERIFY-3: PASS — nav→Dispatch cancel→UI→API→`catalogs.load_cancellation_reasons` (canonical, never RETIRE `cancellation_reasons`)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — deep chain: load→cancel→reason→(optional) revenue-reversal JE both ways under build-and-HOLD.
VERIFY-5: PASS — TRANSP + USMCA each write to their own entity's per-entity reasons; no cross-entity leak; legacy global source removed.
VERIFY-6: PASS (build-and-HOLD) — no unbalanced JE; poster reused for any reversal; flags OFF; NO TMS→QBO write-back.
VERIFY-7: PASS — Dispatch leaf count unchanged; no invented tab.
VERIFY-8: PASS — FORCE RLS on load_cancellation_reasons; GUC-scoped; security_invoker views; legacy REVOKEd; grants correct.
MODULE_PROGRESS: dispatch N of M (must match docs/module-completion/dispatch.json AFTER this PR)
ITEMS_TOUCHED: cancel-load-writer, load_cancellation_reasons-picker, cancellation_reasons-archive
MIGRATE: number strictly above main max (above both 202607950000 and 202607960000, e.g. 202607970002, distinct) / idempotent / REVOKE on legacy + retirement COMMENT / no hardcoded UUID / grants / validate on throwaway only / checksum-override same PR. (No new opco DDL — load_cancellation_reasons already PER-ENTITY.)
ROOT CAUSE: residual/historic cancel-load writer targeted legacy global `cancellation_reasons` instead of canonical per-entity `load_cancellation_reasons` (LST-F17 ruling A).
FIX: confirm/repoint writer + picker to `catalogs.load_cancellation_reasons`; archive legacy via REVOKE + COMMENT (never drop). Files: server cancel-load route, dispatch cancel dialog, migrations/202607970002_*.sql.
GUARD: scripts/verify-steps/NNN-verify-cancel-load-canonical-reason.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 writer confirm + prod cancel row in load_cancellation_reasons + legacy REVOKE proof.
REMAINING: confirm #3436 merged on origin/main and legacy archive applied; no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
