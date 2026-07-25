<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F06 — F06 · 9 base-less fetch("/api/…") in drug-alcohol/permits resolve to the wrong host
**FINDING:** F06 (P0, no FIN-HOLD) · **Lane:** NON-FINANCIAL · **Module:** Safety (Drug & Alcohol / Permits).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Safety/Drug&Alcohol · §Permits) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§API base contract) · IH35_ARCHITECTURAL_DESIGN.md (module Safety · client API layer) · docs/lockdown/00_LOCKED_DECISIONS.md (single API base)
Approved screens reviewed: docs/approved-screens/safety.png
Tab count check (Rule 05): design says N Safety leaves · this block changes count to same N (client fetch-base correctness — no leaf change).
Deviations from spec: None.
NEW SPEC items (Rule 01): None.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
Nine `fetch("/api/…")` calls in the Drug & Alcohol and Permits screens are base-less (relative). In the deployed topology the app is not served from the API origin, so a bare `/api/...` resolves against the WRONG host (the web origin, not the API) → the calls 404/CORS-fail and the screens silently show nothing or fail to persist. **Step 1 — reproduce (Rule 10, lucia):** (a) grep the Safety client for `fetch("/api/` (and template-literal variants) in the drug-alcohol + permits modules; enumerate the 9 sites and confirm none prepend the configured API base. (b) In browser (TRANSP), open Drug & Alcohol and Permits, watch the network tab: confirm the requests target the web origin and fail (404/CORS). (c) Confirm the correct base is available (env/config/api-client helper the rest of the app uses). This is a client-routing defect; no schema fact needed — but confirm the target endpoints exist server-side. Prod branch br-fancy-credit-akjnd07a wins.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: each call must hit the SAME server API base the rest of the app uses (shared api-client), reaching the canonical Safety endpoints → canonical `safety.*` tables; NEVER the wrong host, NEVER a RETIRE table.
2. Hub matrix (both-way): drug/alcohol test → `mdata.drivers` · `org.companies` · `identity.users`; permit → `mdata.units` (or driver) · `org.companies`. Fixing the base restores these reads/writes both ways.
3. Cross-module (Rule 21 §1) — Safety §10.3: D&A results feed the driver-qualification gate (SAF-F07) and Driver detail reverse section (SAF-F16); permits feed Unit profile (SAF-F17). All broken while the base is wrong.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
Professional SPA API-client discipline: one configured base URL / shared client, never scattered relative fetches that depend on co-located origins. FMCSA D&A (49 CFR Part 382) and permit records must actually reach the server to be recorded — a silently-failing fetch is a compliance data-loss.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/repair — no data change; route the 9 calls through the shared api-client. Enforce (unchanged): operating_company_id RLS on the D&A/permit tables · security_invoker views · append-only audit · display IDs server-generated. No financial writes here; if a D&A/permit action later posts (it should not), it inherits Rule 13. Rule 19 N/A.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = 9 relative `fetch("/api/…")` calls omit the configured API base, so in the deployed topology they resolve to the web origin. Fix: route all 9 through the shared api-client / base-URL helper the rest of the app uses (single source of truth for the base), so every Safety D&A/permit request reaches the API origin with correct credentials/headers. No per-call hardcoded host; use the existing config. Confirm the 9 target endpoints exist and are entity-scoped server-side.

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-safety-api-base.mjs` + `scripts/verify-steps/NNN-verify-safety-api-base.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (any Safety client `fetch("/api/…")` without the shared base / api-client), PASSes on fix (all 9 go through the shared client). `--selftest` mutates a real client copy to reintroduce a base-less fetch, asserts flagged; asserts a base-correct call not flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in the deployed env (TRANSP + USMCA), open Drug & Alcohol and Permits → all requests hit the API origin, 200, data renders and persists; guard green. UNVERIFIED — the 9 call sites + deployed base pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F06
LANE: NON-FINANCIAL
DOD-A: FAIL→PASS — D&A/Permits screens become truly active (were dead due to wrong-host fetches); no DUAL_PATH_OLD_ACTIVE twin.
DOD-B: PASS — form fields already controlled; fixing the base makes the payload actually reach the server.
DOD-C: PASS — D&A/permit ↔ driver/unit/company FKs both ways once the calls reach the API; no memo/uuid-in-name/jsonb.
DOD-D: N/A — non-financial; no money object selected here.
DOD-E: UNVERIFIED — 9 call sites + deployed base pending Step-1 reproduce.
VERIFY-1: PASS — screens render QBO chrome once data loads; no change to chrome.
VERIFY-2: PASS — D&A/permit pickers (result type, permit type) bind canonical catalogs (SAF-F15) once reachable.
VERIFY-3: FAIL→PASS — nav→Safety D&A/Permits→UI→API (correct base)→canonical safety.* tables→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — D&A result → qualification gate (F07) → driver reverse section (F16), reachable once base is fixed.
VERIFY-5: PASS — TRANSP + USMCA isolation preserved (server-side scope); no cross-entity leak.
VERIFY-6: N/A — non-financial; NO TMS→QBO write-back.
VERIFY-7: PASS — Safety leaf count unchanged.
VERIFY-8: PASS — shared client carries auth/GUC context; FORCE RLS on D&A/permit tables enforced server-side.
MODULE_PROGRESS: safety N of M (must match docs/module-completion/safety.json AFTER this PR)
ITEMS_TOUCHED: drug-alcohol-fetch-base, permits-fetch-base, shared-api-client
MIGRATE: N/A — client routing fix; no DDL. (If a target endpoint/table is genuinely missing, that is a separate block, not this one.)
ROOT CAUSE: 9 relative fetch("/api/…") calls omit the configured API base → resolve to the web origin (wrong host) in the deployed topology → 404/CORS.
FIX: route all 9 Safety D&A/permit calls through the shared api-client/base-URL helper. Files: Safety drug-alcohol client, Safety permits client, shared api-client.
GUARD: scripts/verify-steps/NNN-verify-safety-api-base.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 call-site inventory + deployed network proof of 200s.
REMAINING: SAF-F07 (qualification gate) and F16 (driver reverse) depend on these calls working; no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
