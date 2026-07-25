<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F01 — F01 · /safety/escrow-record Forfeit calls /escrow/:driverId/forfeit which does not exist (404)
**FINDING:** F01 (P0, FIN-HOLD) · **Lane:** FINANCIAL-HOLD · **Module:** Safety (Driver Escrow).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Safety/Driver Escrow) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Safety linkage §10.3) · IH35_ARCHITECTURAL_DESIGN.md (module Safety) · docs/lockdown/00_LOCKED_DECISIONS.md (escrow = driver-money liability; Rule 13/19)
Approved screens reviewed: docs/approved-screens/safety.png · docs/approved-screens/7Drivers.png
Tab count check (Rule 05): design says N Safety leaves · this block changes count to same N (wire an existing action's missing handler — no leaf change).
Deviations from spec: None.
NEW SPEC items (Rule 01): None — forfeiture already specified; this restores a broken action, it does not add scope.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
The Escrow Record "Forfeit" button issues `POST /escrow/:driverId/forfeit` but no such route is registered server-side → 404, so a driver-money movement silently fails (worst class of financial defect: the UI implies money moved, the ledger recorded nothing). **Step 1 — reproduce (Rule 10, lucia):** (a) grep client for the Forfeit handler and capture the exact fetch path + method; grep server route table for a matching `forfeit` handler — confirm ABSENT on origin/main. (b) In browser (TRANSP) open a driver Escrow Record, click Forfeit, read the network tab: expect 404. (c) Confirm the escrow ledger/liability table exists and its shape: `SET app.bypass_rls='lucia'; SELECT to_regclass('safety.driver_escrow'), to_regclass('safety.driver_escrow_transactions');` and inspect `information_schema.columns` for the balance/liability_account columns — do NOT assume names (not in backbone). Prod branch br-fancy-credit-akjnd07a wins over migrations/memory.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: escrow forfeiture writes to the canonical escrow ledger `safety.driver_escrow*` [AUDIT — confirm to_regclass live] and its offsetting entry to `accounting.journal_entries` (backbone-verified) — NEVER a RETIRE table; escrow liability account is OWNER-MANUAL (Rule 19).
2. Hub matrix (both-way): forfeiture → `mdata.drivers` (reverse: driver escrow tab shows the forfeit) · `org.companies` (entity scope) · `identity.users` (actor) · `accounting.journal_entries` (reverse: JE references the escrow event) · escrow liability `catalogs.accounts` (owner-selected).
3. Cross-module (Rule 21 §1) — Safety §10.3: escrow event → Driver, Unit(if event-driven), Operating Company; → Accounting (escrow = liability, forfeiture = liability→income/offset); Driver detail Escrow section drills both ways. No insurance/legal/maintenance leg unless the forfeiture is tied to a damage/claim event (then link those too).
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
QuickBooks/NetSuite liability-account discipline + ASC 470-60 build-and-HOLD posture: driver escrow is money held ON BEHALF OF the driver = a liability; a forfeiture is an owner-authorized liability reduction with a matched JE. McLeod/Alvys driver-escrow ledgers never let a UI action claim a movement the ledger did not record.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — no DROP/DELETE/TRUNCATE; a forfeiture is an append-only ledger event + void-not-delete reversal path. Enforce: operating_company_id RLS on escrow tables · views WITH(security_invoker=true) · lockstep INSERT (escrow event + matched JE) · append-only audit on mutation · display IDs server-generated · +Create semantics. **Financial (FIN-HOLD): Rule 13** — build-and-HOLD; reuse the existing poster (no new GL math); parallel books; QBO NEVER written; flags default OFF; ASC 470-60. **Rule 19** — the escrow/holdback liability account is OWNER-MANUAL: never create/import/reclassify/merge/deactivate it; the route SELECTS an owner-provided account, never invents one.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = a client action wired to a server route that was never registered. Fix: register the missing `POST /escrow/:driverId/forfeit` handler that (1) validates the driver + entity scope (GUC), (2) requires an owner-selected escrow liability account and an amount ≤ current held balance and a reason, (3) writes an append-only escrow forfeiture event and calls the EXISTING poster to record the matched JE (build-and-HOLD, flags OFF, no QBO write-back), (4) returns the new balance so the UI reflects reality. No invented account, no invented threshold (see SAF-F09), no direct GL math.

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-escrow-forfeit-route.mjs` + `scripts/verify-steps/NNN-verify-escrow-forfeit-route.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (client path has no matching server route → 404 / route table missing `forfeit`), PASSes on fix (route registered, entity-scoped, matched-JE poster invoked, flags OFF). `--selftest` mutates a real route-registry copy to remove the handler, asserts flagged; asserts the registered shape not flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, click Forfeit → 200; escrow event row + matched JE row land scoped to the entity, driver balance decrements, Driver detail Escrow section shows the event both ways; QBO untouched; guard green. UNVERIFIED — escrow table/route names pending Step-1 reproduce on origin/main + prod.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F01
LANE: FINANCIAL-HOLD
DOD-A: FAIL→FIX — action was a dead path (404); fix registers the active route + handler; no DUAL_PATH_OLD_ACTIVE/ComingSoon twin.
DOD-B: PASS — Forfeit modal fields (account, amount, reason) controlled AND in submit payload (coordinates with SAF-F10).
DOD-C: PASS — forfeiture ↔ driver ↔ escrow-ledger ↔ journal_entries FKs both ways; no memo/uuid-in-name/jsonb-ids.
DOD-D: PASS — purpose (forfeit held driver money) picks the owner-selected escrow liability account + matched JE; no silent default.
DOD-E: UNVERIFIED — escrow table/route names pending Step-1; canonical JE hub verified in backbone.
VERIFY-1: PASS — Forfeit uses ParityDrawer/QBO chrome; Due/amount fields; +Create semantics, no +New.
VERIFY-2: N/A — no catalog picker here except the account picker (covered by SAF-F10/F14 postable-account rules).
VERIFY-3: FAIL→PASS — nav→Safety escrow→UI→API→canonical escrow ledger + journal_entries (never RETIRE)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — deep chain: forfeiture→escrow event→matched JE (build-and-HOLD) both ways; claim/WO leg only if event-tied.
VERIFY-5: PASS — TRANSP + USMCA each forfeit within their own entity; no cross-entity escrow leak.
VERIFY-6: PASS (build-and-HOLD) — balanced JE when flag ON via reused poster; owner-selected control account; flags OFF; NO TMS→QBO write-back.
VERIFY-7: PASS — Safety leaf count unchanged; no invented tab.
VERIFY-8: PASS — FORCE RLS on escrow tables; correct GUC; security_invoker views; grants; server-side entity check in the new route.
MODULE_PROGRESS: safety N of M (must match docs/module-completion/safety.json AFTER this PR; M grows as SAF-F01..F18 land)
ITEMS_TOUCHED: escrow-forfeit-route, escrow-ledger-writer, escrow-matched-JE-poster
MIGRATE: N/A — route registration + poster reuse; no new DDL if escrow ledger already exists (confirm Step-1). If a both-way FK is missing, add idempotent migration above BOTH 202607950000 and 202607960000 (e.g. 202607970001, distinct), FORCE RLS, REVOKE DELETE, dynamic org.companies, checksum-override same PR.
ROOT CAUSE: client Forfeit action points to an unregistered server route; the money movement 404s silently.
FIX: register POST /escrow/:driverId/forfeit; validate scope+account+amount+reason; append-only escrow event + reused matched-JE poster. Files: server escrow route module, escrow ledger writer, Safety escrow client action.
GUARD: scripts/verify-steps/NNN-verify-escrow-forfeit-route.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 route/table reproduce + prod forfeit event + matched JE row.
REMAINING: SAF-F09 (no invented threshold) + SAF-F10 (modal validation) must land with/before this to make the action honest end-to-end; no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
