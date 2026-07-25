# BLOCK COMPLIANCE STANDARD — every block must satisfy ALL of this (2026-07-25)

Built from the full `.cursor/rules/00–24` + Constitution + DEFINITION-OF-DONE + EVERY-PR-CHECKLIST +
Full-Audit-Law. A block is COMPLETE only when it carries every section below, filled, with prod-verified facts
or an explicit `UNVERIFIED — <blocker> · Step-1 reproduce`. Never assert a column/count/RLS/opco fact you did
not read live — classify by opco VALUES + policy, never column presence (see VERIFIED-LINKAGE-BACKBONE).

---

## THE BLOCK TEMPLATE (use verbatim structure)

```
# <PREFIX>-<NN> — <FINDING-CODE> · <short title>
**FINDING:** <code> (<P0/P1/P2/P3>, FIN-HOLD?) · **Lane:** <FINANCIAL-HOLD|NON-FINANCIAL|DOCS> · **Module:** <m>.

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§<x>) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§<x>) · IH35_ARCHITECTURAL_DESIGN.md (module <m>) · docs/lockdown/00_LOCKED_DECISIONS.md (if financial)
Approved screens reviewed: docs/approved-screens/<module>.png
Tab count check (Rule 05): design says <N> tabs · this block changes count to <N> (matches / needs same-commit design update)
Deviations from spec: <None | list+rationale>
NEW SPEC items (Rule 01): <None | list — needs Jorge approval before build>

## PROD TRUTH  [GUARD-VERIFIED <date> | AUDIT — RE-VERIFY LIVE]
<one-line finding restatement>. **Step 1 — reproduce (Rule 10, lucia):** <exact query/click-through; RLS 0-count landmine — SET app.bypass_rls='lucia' in same txn; prod branch br-fancy-credit-akjnd07a wins over migrations/memory>.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: to_regclass('<schema.table>') non-null (from VERIFIED-LINKAGE-BACKBONE), NEVER a RETIRE table.
2. Hub matrix: which of org.companies · identity.users · mdata.drivers/units/loads/customers/vendors · catalogs.accounts · maintenance.work_orders · accounting.journal_entries this record links to, BOTH-WAY (forward + reverse).
3. Cross-module (Rule 21 §1): every module/tab this touches shows it and drills both ways.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
<QuickBooks | NetSuite | McLeod | Alvys | US GAAP/ASC 470-60/606/842 | FMCSA | RLS/WORM> — name the standard this conforms to and why.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — no DROP/DELETE/TRUNCATE; archive/void/deactivate. Enforce: operating_company_id RLS on every table touched · views WITH(security_invoker=true) · lockstep INSERT · append-only audit on mutation · void-not-delete · idempotent migration (DO + IF NOT EXISTS) · display IDs server-generated (Rule 03) · +Create/+Book never +New/+Add · production never serves fake data.
<If financial: Rule 13 — build-and-HOLD, reuse the poster (no new GL math), parallel books, QBO NEVER written, flags default OFF, ASC 470-60 Ch.11. Rule 19 — reserve/holdback/retainage accounts are OWNER-MANUAL only: never create/import/reclassify/merge/deactivate them.>

## THE FIX (requirement-level; no invented unverified SQL)
<what changes at root, not a patch>

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-<name>.mjs + scripts/verify-steps/NNN-verify-<name>.mjs (NEVER edit package.json/ci.yml/locked-guards). FAIL on the bug (vs pre-fix main), PASS on the fix; --selftest mutates REAL source, one case per assertion, and asserts the corrected shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
<live proof required: file+route mounted + column populated 0-NULL + guard wired + browser/endpoint + Neon lucia row — OR "UNVERIFIED — <blocker>">

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: <code>
LANE: <HOLD|FINANCIAL-HOLD|NON-FINANCIAL|DOCS>
DOD-A: <PASS|N/A|FAIL|UNVERIFIED—why>  Active path (route registered, component mounted, nav leaf; no DUAL_PATH_OLD_ACTIVE/ComingSoon twin)
DOD-B: <...>  Wizard depth (every rendered field controlled AND in submit payload)
DOD-C: <...>  Law §9 linkage FORWARD+REVERSE (canonical FKs both ways; memo/uuid-in-name/jsonb-ids = FAIL)
DOD-D: <...>  Purpose→economics (purpose picks the money object; no silent default)
DOD-E: <...>  Evidence (live proof or UNVERIFIED+named blocker)
VERIFY-1: <...>  Visual/QBO chrome (ParityDrawer side panel, calendar, Due auto, box-in-box, +Create/+Book, drawer-on-drawer)
VERIFY-2: <...>  Universal picker law — all 7 clauses (catalog behind it · inline +Add new as FIRST ROW inside dropdown · opens QBO wizard · same canonical table write=read · appears+selected+survives reload · entity-scoped)
VERIFY-3: <...>  Connectivity — nav→route→UI→API→CANONICAL Neon table (never RETIRE)→same R/W→entity-scoped→flags honest
VERIFY-4: <...>  Deep linkage chains F+R (claim/at-fault/WO/expense/bill+payment as applicable)
VERIFY-5: <...>  Catalogs/entity scope — TRANSP AND USMCA; drivers-as-vendors; units by owner/lease; no cross-entity leak
VERIFY-6: <...>  Economics CPA-grade — header+lines; balanced JE when flag ON; control roles; flags honest; NO TMS→QBO write-back
VERIFY-7: <...>  Tab/design law (Rule 05) — every approved leaf; no silent-missing; no invented tabs; design updated same commit if count changes
VERIFY-8: <...>  Security/RLS — FORCE RLS; correct GUC; security_invoker; grants
MODULE_PROGRESS: <module> N of M  (must match docs/module-completion/<module>.json AFTER this PR; Rule 24; M grows when new FAILs appear, Rule 21)
ITEMS_TOUCHED: <manifest item ids>
MIGRATE: <N/A | number strictly above main max (Rule 10: ledger max 202607950000, main has unapplied 202607960000 — go above BOTH, distinct) / idempotent / dynamic org.companies NO hardcoded UUID / FORCE RLS / REVOKE DELETE / grants / validate on throwaway only / checksum-override same PR>
ROOT CAUSE: <mechanism, not symptom>
FIX: <root fix, files>
GUARD: scripts/verify-steps/NNN-...
LIVE PROOF: <sha/url/Neon-row/browser — or UNVERIFIED+blocker>
REMAINING: <none defensible | owner-approved deferral: tracker + future block id>
```

## RULE-21 NON-NEGOTIABLE (no partial-wave amnesia)
Every module/tab links both ways; every money event economically complete; active product = new design (kill DUAL_PATH_OLD_ACTIVE); finish the MODULE under Full Audit Law before the next; M grows, never freeze to hide leaves; CI-green ≠ done, chrome ≠ linkage, wave-slice ≠ module.

## PROVENANCE (Rule 06/10 honesty)
[GUARD-VERIFIED <date>] = reproduced on prod this session. [AUDIT — RE-VERIFY LIVE] = from the Desktop module audit, Step-1 reproduces before freezing. [OWNER DECISION] = surface, don't auto-fix. Never a verdict without an evidence field.
```
