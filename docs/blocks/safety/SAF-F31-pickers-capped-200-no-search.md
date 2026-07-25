<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F31 — F31 · pickers capped at 200 rows, no server-side search
**FINDING:** F31 (P2) · **Lane:** NON-FINANCIAL · **Module:** Safety (pickers). **Provenance: [AUDIT — RE-VERIFY LIVE] — the capped pickers are not enumerated in VERIFIED-LINKAGE-BACKBONE; Step-1 reproduces before freeze.**

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Pickers / server search) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§picker scalability) · IH35_ARCHITECTURAL_DESIGN.md (module Safety) · docs/lockdown/00_LOCKED_DECISIONS.md (N/A — UX/correctness).
Approved screens reviewed: docs/approved-screens/ (Safety picker surfaces).
Tab count check (Rule 05): no leaf change · adds server-side search + removes the 200 cap · count unchanged.
Deviations from spec: the hard 200 cap is the deviation (records beyond 200 are unselectable).
NEW SPEC items (Rule 01): None — makes existing pickers correct/scalable.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
Safety pickers are **capped at 200 rows with no server-side search**, so any catalog/master with >200 rows silently hides records past the cap — a correctness bug (the user cannot select an existing record that exists), not just UX. **Step 1 — reproduce (Rule 10, lucia):** the capped pickers + which masters exceed 200 NOT in backbone → read live:
```
# 1) pickers with a hardcoded 200/limit and no search param (read live)
rg -n "limit.*200|take.*200|slice\\(0, ?200\\)" app/**/safety/**
rg -n "search|query|q=|ilike" app/**/safety/**       # which pickers lack server search
# 2) which backing masters exceed 200 rows (records that get hidden)
psql "$NEON_PROD" -c "BEGIN; SET LOCAL app.bypass_rls='lucia'; SELECT count(*) FROM mdata.drivers; SELECT count(*) FROM mdata.units; SELECT count(*) FROM mdata.vendors; ROLLBACK;"
```
Enumerate the capped pickers + confirm which masters exceed 200. [The capped pickers + affected masters are NOT in backbone → confirm live.]

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: each picker queries its canonical master/catalog (drivers/units/vendors/`catalogs.*`) with server-side search + pagination — NEVER a RETIRE table; the fix changes the query, not the target.
2. Hub matrix: the picker still writes a real FK linking BOTH-WAY to `org.companies`-scoped masters; server search must stay entity-scoped (GUC), never leak cross-entity rows.
3. Cross-module (Rule 21 §1): the shared picker gains server search everywhere it is reused; both-way drill unaffected.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
QuickBooks/NetSuite type-ahead server-side search on every reference picker (no client-side truncation of the record set). A picker that hides existing records behind a 200 cap produces wrong selections/omissions — a data-integrity issue, not cosmetics.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/behavioral only — add server-side search + pagination, remove the client cap; no data change. Enforce: server search runs under operating_company_id RLS + GUC (entity-scoped, security_invoker) · display IDs server-generated. Not financial (Rule 19 N/A).

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = Safety pickers fetch a client-capped 200 rows with no server-side search, so records beyond 200 are unreachable and selection is incorrect for large masters. Fix: add server-side search (entity-scoped ILIKE/trigram under GUC) + pagination to each picker's endpoint, and remove the hardcoded 200 cap on the client; the picker requests matching rows from the server rather than truncating locally. Entity scoping (RLS/GUC) is preserved so search never returns another entity's rows.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-safety-picker-server-search.mjs + scripts/verify-steps/NNN-verify-safety-picker-server-search.mjs (NEVER edit package.json/ci.yml/locked-guards). FAIL on pre-fix main (a Safety picker hardcodes a 200 cap / has no server-search param), PASS on fix (server-side search + pagination, entity-scoped, no client cap). --selftest mutates a REAL picker copy back to a 200 client cap, one case per assertion, and asserts the server-search shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, a Safety picker on a >200-row master finds and selects a record past position 200 via server search, scoped to the entity; no cap truncates the set; guard green. UNVERIFIED — capped pickers + affected masters pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F31
LANE: NON-FINANCIAL
DOD-A: PASS — pickers on registered/mounted Safety surfaces; corrected picker is the active path; no dual path.
DOD-B: PASS — the picker value stays controlled AND in the submit payload; server-search does not change persistence.
DOD-C: PASS — picker writes a real FK both ways; server search resolves canonical rows; no memo/uuid-in-name.
DOD-D: N/A — no money object.
DOD-E: UNVERIFIED — capped pickers + which masters exceed 200 pending Step-1.
VERIFY-1: PASS — picker within ParityDrawer chrome (SAF-F25); type-ahead consistent.
VERIFY-2: PASS — universal picker law preserved (inline +Add first row, write=read) now with server search; entity-scoped; survives reload.
VERIFY-3: PASS — nav→Safety→UI→API(server search)→canonical master (never RETIRE)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — selected record drills both ways into the consuming Safety record.
VERIFY-5: PASS — server search is GUC-scoped for TRANSP and USMCA; NO cross-entity rows returned.
VERIFY-6: N/A — no economics; NO TMS→QBO write-back.
VERIFY-7: PASS — Safety leaf count unchanged; no invented tab.
VERIFY-8: PASS — server search executes under FORCE RLS + correct GUC + security_invoker; grants unchanged; no bypass.
MODULE_PROGRESS: safety N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/safety.json (3 of 32) after PR; M grows per Rule 21].
ITEMS_TOUCHED: safety-picker-server-search (per enumerated picker; manifest ids to resolve live) — [AUDIT].
MIGRATE: N/A — endpoint + client query change; no DDL/DML (a trigram index, if added for search, is idempotent CREATE INDEX IF NOT EXISTS, above both 202607950000 and 202607960000, checksum-override same PR).
ROOT CAUSE: Safety pickers fetch a client-capped 200 rows with no server-side search — records beyond 200 are unreachable, producing incorrect/omitted selections.
FIX: add entity-scoped server-side search + pagination, remove the 200 client cap; files: picker endpoints + client picker components (+ optional trigram index).
GUARD: scripts/verify-steps/NNN-verify-safety-picker-server-search.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 capped-picker enumeration + prod selection of a >200 record via search.
REMAINING: enumerate capped pickers + confirm affected masters; ensure server search stays GUC-scoped; no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
