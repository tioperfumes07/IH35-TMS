<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F35 — F35 · accident "Spawn WO / Liability" shown as text, no EntityLink
**FINDING:** F35 (P2) · **Lane:** NON-FINANCIAL · **Module:** Safety (Accident → WO / Liability). **Provenance: [AUDIT — RE-VERIFY LIVE] — the accident→WO/liability wiring is not in VERIFIED-LINKAGE-BACKBONE; Step-1 reproduces before freeze.**

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Accident → maintenance/liability) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§EntityLink / spawn actions) · IH35_ARCHITECTURAL_DESIGN.md (module Safety + Maintenance) · docs/lockdown/00_LOCKED_DECISIONS.md (N/A — linkage; any liability economics is SAF-F34).
Approved screens reviewed: docs/approved-screens/ (Safety accident detail + 2Maintenance.png).
Tab count check (Rule 05): no leaf change · turns text into real spawn+EntityLink · count unchanged.
Deviations from spec: the text-only "Spawn WO / Liability" is the deviation.
NEW SPEC items (Rule 01): None — wires an action the surface already advertises.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
The accident detail shows **"Spawn WO / Liability" as plain text** — it does not actually create a linked maintenance work order or liability record, and does not render an EntityLink to one. So an accident that should generate a repair WO and/or a liability has a label but no linkage (Rule 21 both-way drill broken; depends on SAF-F33 kinds). **Step 1 — reproduce (Rule 10, lucia):** the wiring NOT in backbone → read live:
```
# is "Spawn WO / Liability" a real action or just text? (read live)
rg -n "Spawn|WO|Liability|work.?order" app/**/safety/**accident*
# canonical WO target (backbone RETIRE note: maintenance.*, never maint.*)
psql "$NEON_PROD" -c "BEGIN; SET LOCAL app.bypass_rls='lucia'; SELECT to_regclass('maintenance.work_orders'); ROLLBACK;"
```
Confirm whether a WO/liability is actually created + linked today (it is not). [The accident→WO/liability wiring is NOT in backbone → confirm live.]

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: spawning a WO writes `maintenance.work_orders` (canonical; NEVER `maint.*` — RETIRE per backbone); spawning a liability writes the canonical liability/claim path (accounting via SAF-F34 under HOLD); both rendered back on the accident via EntityLink (needs SAF-F33 kinds) — NEVER a RETIRE table.
2. Hub matrix: accident → `maintenance.work_orders` (reverse: WO shows its originating accident) + `mdata.units`/`mdata.drivers` + `org.companies` (both scoped) + `accounting.*` where the liability books (SAF-F34, HOLD). Safety §10.3 both-way: accident ↔ Driver/Unit/OperatingCompany/Insurance(claim)/Legal(case)/Accounting(GL)/Maintenance(WO).
3. Cross-module (Rule 21 §1): accident detail, the maintenance WO list, and the liability/claim surface each show the spawned link, drilling both ways.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
McLeod/Alvys: an accident spawns a real, linked repair order and a liability/claim record (traceable both ways), not a label. NetSuite record-generation with back-reference. Rule 21 both-way drill.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — make the spawn create real linked records + EntityLink; no data deletion. Enforce: operating_company_id RLS on accidents + work_orders · views WITH(security_invoker=true) · append-only audit · void-not-delete on spawned records · display IDs server-generated · +Create (never +New). Not a GL-writing block itself (Rule 19 N/A here) — any liability economics is SAF-F34 under Rule 13, reserve accounts owner-manual.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = "Spawn WO / Liability" is a static label; clicking it does not create a linked `maintenance.work_orders` record or a liability, and no EntityLink is rendered — the accident→maintenance/liability chain does not exist. Fix: (1) make the action create a real `maintenance.work_orders` record linked back to the accident (both-way FK) and, where applicable, a liability/claim record (routing any money to SAF-F34 under build-and-HOLD); (2) render the spawned WO/liability on the accident as EntityLinks (needs SAF-F33 kinds) with both-way drill. Idempotent spawn (no duplicate WO on repeat click).

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-accident-spawn-wo-liability.mjs + scripts/verify-steps/NNN-verify-accident-spawn-wo-liability.mjs (NEVER edit package.json/ci.yml/locked-guards). FAIL on pre-fix main ("Spawn WO / Liability" is text / creates no linked record / no EntityLink), PASS on fix (spawn creates a linked maintenance.work_orders + liability with both-way EntityLink; idempotent). --selftest mutates a REAL copy to make spawn a no-op label, one case per assertion, and asserts the real-spawn+link shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, spawning from an accident creates a real `maintenance.work_orders` (and liability where applicable) linked both ways, rendered as EntityLinks; re-clicking does not duplicate; any liability money is HOLD (SAF-F34); guard green. UNVERIFIED — current wiring + WO/liability targets pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F35
LANE: NON-FINANCIAL
DOD-A: PASS — accident detail on a registered/mounted route; the real spawn action is the active path; no dual path (no text-only twin).
DOD-B: PASS — spawn dialog fields (WO type, liability details) controlled AND in the submit payload.
DOD-C: PASS — the core: accident ↔ work_orders (+ liability) real FKs both ways (Law §9); EntityLink resolves them; no memo/uuid-in-name/text.
DOD-D: N/A here — liability money object is SAF-F34 (build-and-HOLD); no silent default.
DOD-E: UNVERIFIED — current text-only wiring + WO/liability canonical targets pending Step-1.
VERIFY-1: PASS — spawn uses ParityDrawer chrome (SAF-F25); +Create; drawer-on-drawer.
VERIFY-2: PASS — any picker in the spawn dialog (WO type, account) follows picker law (SAF-F24), entity-scoped, write=read.
VERIFY-3: PASS — nav→accident→spawn→API→canonical `maintenance.work_orders` (never RETIRE `maint.*`)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — deep chain: accident→WO (repair)→(damage cost SAF-F34)→liability/claim→insurance, all both ways.
VERIFY-5: PASS — TRANSP + USMCA each spawn into their own entity's work_orders; no cross-entity leak.
VERIFY-6: N/A — no economics booked here; NO TMS→QBO write-back (liability economics SAF-F34).
VERIFY-7: PASS — Safety leaf count unchanged; no invented tab.
VERIFY-8: PASS — FORCE RLS + GUC + security_invoker on accidents + work_orders; grants correct; DELETE not granted (void spawn).
MODULE_PROGRESS: safety N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/safety.json (3 of 32) after PR; M grows per Rule 21].
ITEMS_TOUCHED: accident-spawn-wo, accident-spawn-liability, accident-spawn-entitylink (manifest ids to resolve live) — [AUDIT].
MIGRATE: N/A if accident↔WO link uses existing FK columns (code-only wiring). If a link column is added: idempotent additive, above both 202607950000 and 202607960000 (distinct, e.g. 202607970035), FORCE RLS, REVOKE DELETE, dynamic org.companies (no hardcoded UUID), grants, validate on throwaway only, checksum-override same PR.
ROOT CAUSE: "Spawn WO / Liability" is a static label — it creates no linked maintenance.work_orders or liability and renders no EntityLink; the accident→maintenance/liability chain does not exist.
FIX: make spawn create real linked records (maintenance.work_orders + liability) with both-way EntityLink (needs SAF-F33), idempotent; liability money routes to SAF-F34 under HOLD; files: accident detail spawn action + WO/liability wiring.
GUARD: scripts/verify-steps/NNN-verify-accident-spawn-wo-liability.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 current-wiring confirm + prod spawned WO/liability with both-way drill.
REMAINING: land after SAF-F33 (EntityLink kinds); liability economics is SAF-F34 under Rule 13; no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
