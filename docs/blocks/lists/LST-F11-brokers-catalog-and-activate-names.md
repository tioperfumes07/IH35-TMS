<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-F11 — F11 · /lists/names/brokers reuses customers; 4 names catalogs live:false
**FINDING:** F11 (P2) · **Lane:** NON-FINANCIAL · **Module:** lists/names (brokers + names catalogs).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Names/Brokers) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§broker catalog) · IH35_ARCHITECTURAL_DESIGN.md (module lists/names) · docs/lockdown/00_LOCKED_DECISIONS.md (N/A — no GL; broker is an operational counterparty, distinct from AR customer).
Approved screens reviewed: docs/approved-screens/9Lists_and_catalogs.png.
Tab count check (Rule 05): design says the names group exposes broker + the 4 named catalogs as active leaves · today brokers aliases customers and 4 leaves are live:false · this block activates them so the leaf count matches the design · confirm design png.
Deviations from spec: None.
NEW SPEC items (Rule 01): None if the broker catalog + the 4 named catalogs are in the design; if a broker table must be created, that is additive infra. List the 4 catalog names once read live (do not guess them).

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
`/lists/names/brokers` renders the customers catalog (broker is aliased to AR customer, conflating a freight counterparty with an AR customer), and 4 names catalogs are configured `live:false` (hidden/inactive). **Step 1 — reproduce (Rule 10, lucia):** confirm the alias and identify the 4 inactive catalogs + whether a broker table exists:
```
# 1) brokers route reuses the customers source; find the 4 live:false catalog entries
rg -n "brokers|live:\\s*false|customers" app/**/lists/names/**  config/**catalog*    # not in backbone → verify live
# 2) does a canonical broker table exist, distinct from customers?
psql "$NEON_PROD" <<'SQL'
BEGIN; SET LOCAL app.bypass_rls='lucia';
SELECT to_regclass('mdata.brokers') AS brokers_tbl, to_regclass('mdata.customers') AS customers_tbl;
ROLLBACK;
SQL
```
Broker table existence + the 4 catalog identities are NOT in the backbone → read live; do NOT name the 4 catalogs from memory.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: a real broker catalog `to_regclass('mdata.brokers')` (confirm live; additively create with opco + FORCE RLS if missing) — distinct from `mdata.customers`. The 4 named catalogs write their own canonical `catalogs.*`/`mdata.*` tables (identify live). NEVER a RETIRE table.
2. Hub matrix: a broker links BOTH-WAY to `org.companies` (opco) and forward to loads/dispatch (broker on a load) — reverse: a load resolves its broker. If brokers are also billed, they may map to `mdata.vendors` (AP) — confirm the intended economic role in Step-1; do not assume.
3. Cross-module (Rule 21 §1): broker appears on the load/dispatch surface and in the names catalog, drilling both ways; the 4 activated catalogs appear on their intended surfaces.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
McLeod/Alvys broker master — a broker is a distinct freight counterparty (with MC#, credit, factoring), NOT an AR customer alias; conflating them corrupts operational and credit data. Entity-scoped catalog integrity.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — build the broker catalog and flip the 4 catalogs `live:true` (activation is additive config, not deletion); if a broker table is missing, additive idempotent CREATE with opco + FORCE RLS. Do NOT delete the customers alias data; leave existing customer rows intact. Enforce: RLS · append-only audit · void-not-delete · display IDs server-generated · +Create not +New. Not financial unless brokers are billed (then confirm AP mapping — still no GL math here; Rule 19 reserve untouched).

## THE FIX (requirement-level; no invented unverified SQL)
Stand up a real broker catalog on its own canonical table (create additively if absent), repoint `/lists/names/brokers` to it (stop aliasing customers), and activate the 4 `live:false` names catalogs by flipping their config to `live:true` and confirming each writes its own canonical table under GUC. Identify the 4 by reading config live — never by guess.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-brokers-and-names-catalogs.mjs + scripts/verify-steps/NNN-verify-brokers-and-names-catalogs.mjs. FAIL on pre-fix main (brokers route source == customers table, OR any of the 4 catalogs `live:false`); PASS on the fix (brokers reads canonical broker table; all 4 `live:true` and each bound to its own canonical table). --selftest mutates REAL source to re-alias brokers/re-hide a catalog, one case per assertion, and asserts the fixed shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: create a broker via the broker route → Neon lucia row in the broker table (not customers) under correct opco (TRANSP and USMCA); the 4 catalogs render live with rows from their own tables; guard wired; browser round-trip. OR "UNVERIFIED — broker table + 4 catalog identities not yet confirmed; Step-1 pending".

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F11
LANE: NON-FINANCIAL
DOD-A: PASS (post-build) — brokers route mounts its own component/source; the 4 catalogs are active leaves; no ComingSoon/hidden twin.
DOD-B: PASS — broker create fields controlled AND in payload AND written to the broker table.
DOD-C: PASS — broker↔load FORWARD+REVERSE via canonical FK; no aliasing customers, no uuid-in-name.
DOD-D: N/A here (no money object) — if brokers are billed, AP mapping confirmed in Step-1, tracked separately.
DOD-E: UNVERIFIED — broker table + the 4 catalog identities must be read live before freeze.
VERIFY-1: PASS — list chrome + +Create broker; drawer.
VERIFY-2: PASS — broker picker on loads reads/writes the same canonical broker table; inline +Add new broker first row; entity-scoped.
VERIFY-3: PASS — nav→/lists/names/brokers→UI→API→CANONICAL broker table (not customers, not RETIRE)→same R/W→entity-scoped→flags honest (live:true).
VERIFY-4: N/A — no claim/WO/expense chain (broker credit/factoring downstream).
VERIFY-5: PASS — TRANSP and USMCA brokers + the 4 catalogs opco-scoped; no cross-entity leak.
VERIFY-6: N/A — no economics in this block; NO TMS→QBO write-back.
VERIFY-7: PASS — names leaf count matches design after activation (Rule 05); no invented tabs.
VERIFY-8: PASS — broker table + 4 catalogs FORCE RLS, correct GUC, security_invoker, grants.
MODULE_PROGRESS: lists N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/lists.json after PR].
ITEMS_TOUCHED: brokers-catalog, names-catalog-activate-x4 (manifest ids to resolve live) — [AUDIT].
MIGRATE: N/A if broker table exists — else additive idempotent CREATE above main max, > 202607960000 distinct, opco + FORCE RLS + REVOKE DELETE + grants + dynamic org.companies; activating the 4 catalogs is config (`live:true`), no DDL/DML unless a catalog table is missing (then additive).
ROOT CAUSE: brokers leaf was aliased to the customers catalog (never given its own entity), and 4 names catalogs were left `live:false`.
FIX: create/repoint the broker catalog to its own canonical table; set the 4 catalogs `live:true` and bind each to its own table; files: names route config + broker page/API + (conditional) migration.
GUARD: scripts/verify-steps/NNN-verify-brokers-and-names-catalogs.mjs
LIVE PROOF: <Neon broker row + 4 catalogs live + browser — or UNVERIFIED: broker table/4 identities unconfirmed>
REMAINING: broker credit/factoring/AP-billing behavior tracked as downstream blocks if beyond the names catalog design (owner-approved deferral).

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
