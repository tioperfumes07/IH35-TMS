<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F32 — F32 · permits 2290 banner hardcodes "Aug 31" (no hardcoded dates)
**FINDING:** F32 (P2→P1) · **Lane:** NON-FINANCIAL · **Module:** Safety (Permits / Form 2290 banner). **Provenance: [AUDIT — RE-VERIFY LIVE] — the banner source is not in VERIFIED-LINKAGE-BACKBONE; Step-1 reproduces before freeze. Escalated P2→P1 because a hardcoded compliance deadline can mislead a filing (regulatory risk).**

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Permits / IRS Form 2290 HVUT) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§no hardcoded dates) · IH35_ARCHITECTURAL_DESIGN.md (module Safety) · docs/lockdown/00_LOCKED_DECISIONS.md (compliance-date correctness).
Approved screens reviewed: docs/approved-screens/ (Safety permits surface).
Tab count check (Rule 05): no leaf change · replaces the hardcoded date with a computed deadline · count unchanged.
Deviations from spec: the hardcoded "Aug 31" is the deviation.
NEW SPEC items (Rule 01): None — makes an existing banner compute the correct deadline.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
The Permits Form 2290 (HVUT) banner **hardcodes "Aug 31"** as the filing deadline. IRS Form 2290 is due by the last day of the month following the month of first use; the annual filing period runs July 1–June 30 with the standard renewal due **Aug 31** — but that date is not universal (new/first-use vehicles have a different due date, and it shifts to the next business day when Aug 31 falls on a weekend/holiday). A hardcoded literal is wrong for those cases and can mislead a tax filing — hence P2→P1. **Step 1 — reproduce (Rule 10):** the banner source NOT in backbone → read live:
```
# find the hardcoded date in the 2290 banner (read live)
rg -n "Aug 31|August 31|2290|HVUT" app/**/safety/**
# confirm whether a per-vehicle first-use date / due-date field exists to compute from
psql "$NEON_PROD" -c "BEGIN; SET LOCAL app.bypass_rls='lucia'; SELECT column_name FROM information_schema.columns WHERE table_name ILIKE '%permit%' OR table_name ILIKE '%2290%'; ROLLBACK;"
```
[The banner file + whether a first-use/due-date field exists are NOT in backbone → confirm live; escalation rests on the misleading-deadline risk.]

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: the 2290 due date is COMPUTED from the vehicle's first-use month (per-unit) and the IRS rule (last day of the month following first use; next business day if the standard Aug 31 lands on a weekend/holiday), read from the canonical permit/unit record — NEVER a hardcoded literal, NEVER a RETIRE table.
2. Hub matrix: permit/2290 → `mdata.units` (reverse: unit shows its 2290 status/due) + `org.companies` (both scoped); the banner reflects the earliest upcoming per-unit deadline.
3. Cross-module (Rule 21 §1): unit profile and the permits surface show the computed 2290 due date, drilling both ways to the unit.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
IRS Form 2290 HVUT rules (26 CFR / IRS Instructions): due the last day of the month after first use; annual renewal typically Aug 31 but adjusted for weekends/holidays and different for new-in-service vehicles. NetSuite/QuickBooks compliance dates are computed from source facts, never hardcoded. No-hardcoded-dates invariant.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/behavioral only — replace the literal with a computed deadline; no data change. Enforce: operating_company_id RLS + security_invoker on the permit/unit reads · display IDs server-generated · no hardcoded dates. Not financial (Rule 19 N/A; the HVUT tax payment itself, if booked, is a separate FIN block, not this banner).

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = the 2290 banner renders a hardcoded "Aug 31" instead of computing the IRS due date from each unit's first-use month (and adjusting for weekend/holiday), so it is wrong for first-use vehicles and for years where Aug 31 is not a business day — a compliance-misleading defect. Fix: compute the due date from the canonical per-unit first-use month per the IRS rule (last day of month following first use; standard annual = Aug 31 shifted to next business day), and render the earliest upcoming per-unit deadline in the banner. If the source date field is missing, add it via additive migration and surface it in the permit capture.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-permit-2290-no-hardcoded-date.mjs + scripts/verify-steps/NNN-verify-permit-2290-no-hardcoded-date.mjs (NEVER edit package.json/ci.yml/locked-guards). FAIL on pre-fix main (the 2290 banner contains a hardcoded date literal), PASS on fix (due date computed from per-unit first-use + IRS rule; no literal). --selftest mutates a REAL banner copy back to a hardcoded date, one case per assertion, and asserts the computed-date shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, the 2290 banner shows a due date computed from unit first-use (correct for a first-use vehicle and for a year where Aug 31 is a weekend); no hardcoded literal; guard green. UNVERIFIED — banner file + first-use/due field pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F32
LANE: NON-FINANCIAL
DOD-A: PASS — permits surface on a registered/mounted route; corrected banner is the active path; no dual path.
DOD-B: PASS — if a first-use date field is captured, it is controlled AND in the submit payload.
DOD-C: PASS — permit/2290 ↔ unit FK both ways; computed date reads the real FK; no memo/uuid-in-name.
DOD-D: N/A — no money object (HVUT payment booking is a separate block).
DOD-E: UNVERIFIED — banner file + first-use/due-date field pending Step-1.
VERIFY-1: PASS — banner/permit surface uses the standard Safety chrome (SAF-F25).
VERIFY-2: PASS — any unit picker follows picker law (SAF-F24), entity-scoped.
VERIFY-3: PASS — nav→Safety permits→UI→API→canonical permit/unit record (never RETIRE)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — 2290 due date drills to the unit both ways.
VERIFY-5: PASS — TRANSP + USMCA each compute from their own units; no cross-entity leak.
VERIFY-6: N/A — no economics in this block; NO TMS→QBO write-back.
VERIFY-7: PASS — Safety leaf count unchanged; no invented tab.
VERIFY-8: PASS — FORCE RLS + GUC + security_invoker on permit/unit reads; grants unchanged.
MODULE_PROGRESS: safety N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/safety.json (3 of 32) after PR; M grows per Rule 21].
ITEMS_TOUCHED: permit-2290-computed-deadline, permit-first-use-date-capture (manifest ids to resolve live) — [AUDIT].
MIGRATE: N/A if a per-unit first-use/due-date field exists (code-only compute). If missing: idempotent additive ADD COLUMN first_use_month/due_date, above both 202607950000 and 202607960000 (distinct, e.g. 202607970032), FORCE RLS, REVOKE DELETE, grants, validate on throwaway only, checksum-override same PR.
ROOT CAUSE: 2290 banner hardcodes "Aug 31" instead of computing the IRS HVUT due date from per-unit first-use (+ weekend/holiday shift) — misleading for first-use vehicles and non-business-day years.
FIX: compute the due date from canonical per-unit first-use per the IRS rule; render earliest upcoming per-unit deadline; files: permits banner + (optional) first-use field capture + additive migration.
GUARD: scripts/verify-steps/NNN-verify-permit-2290-no-hardcoded-date.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 banner source + prod computed date for a first-use unit.
REMAINING: confirm first-use/due field exists or migrate; HVUT payment booking is a separate FIN block; no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
