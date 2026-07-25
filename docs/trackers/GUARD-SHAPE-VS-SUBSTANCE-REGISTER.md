# Guard audit — shape vs substance (open register)

**Owner directive 2026-07-24:** *"audit the guard suite for shape-vs-substance … These are the same
disease. List them; we tighten them one at a time."*

**The disease:** a guard that asserts the *shape* of compliance (a keyword is present, two things
match each other, a file exists, a number is unchanged) rather than the *substance* (the defect is
actually absent). Such a guard is worse than none — it converts an unchecked risk into a false
assurance. It is why CI stayed green through a deploy outage, through five non-reviewable PRs, and
through an inverted canonical-table map, all on the same day.

**Diagnostic question:** *if the exact defect this guard is named for were present right now, would
this guard fail?* If the honest answer is "not necessarily", it belongs on this list.

**Rule:** tighten one at a time. Each fix must FAIL on the real pre-fix source (a committed fixture
or a replay against `origin/main`) and PASS on the corrected shape. Never weaken a guard to go green
— check whether the GUARD is wrong first.

---

## FIXED

| # | Guard | Shape it checked | Substance it missed | Fix |
|---|---|---|---|---|
| S1 | `verify-definition-of-done-evidence.mjs` | keyword *anywhere* in the commit message (`/guard/i`, `/(live proof\|verified\|…)/i`); `/\bfix\b/` auto-passed any `fix(scope):` subject; `REMAINING` absent from `EVIDENCE_KEYS`; reads commits over `merge-base..HEAD`, **empty on main** | 5 merged PRs carried **zero** evidence-block sections and went green. DoD §3 ("required in every PR body") was unenforced by construction | labelled lines + `REMAINING` + artifact requirement + a PR-body check reading `$GITHUB_EVENT_PATH`; the 5 real PR bodies committed as pre-fix fixtures |
| S4 | migration "reject edited applied migrations" | CI-internal from-0001 consistency | **not prod-ledger parity** — migration 910 drifted from the prod ledger, CI stayed green, every deploy pre-deploy-failed | #3418 pins a prod-ledger checksum manifest (step 1421) |
| S7 | `verify-canonical-table-writes.mjs` | **the canonical map was INVERTED** for cancellation reasons: it declared the modern per-entity `catalogs.load_cancellation_reasons` as RETIRE and the legacy global `catalogs.cancellation_reasons` as canonical | a regression writing the **legacy** table passed, while 6 **correct** writes to the canonical table were baselined as violations. Prod: legacy has no `operating_company_id`, `relrowsecurity=false`, 9 rows; canonical has opco NOT NULL, FORCE RLS, 63 rows. `202606300130` header says verbatim that `load_cancellation_reasons` is "the go-forward home" | direction flipped; 6 bogus exemptions removed; 4 historical migration writes exempted with reasons. **Proof:** a planted `INSERT INTO catalogs.cancellation_reasons` now FAILS (exit 1) where it previously passed |

## CONFIRMED OPEN

| # | Guard | Finding | Evidence |
|---|---|---|---|
| S2 | `verify-no-hardcoded-list-counts.mjs` | scans **4 frontend hub files**; the live hardcode is in the **backend** (`lists-module-count-spec.ts:96`, literal `3` against a real 16-row table). The guard named for this defect class cannot see it | `scripts/verify-no-hardcoded-list-counts.mjs:7-12`; `ci.yml:645` |
| S3 | `DomainCountParity.test.ts` | asserts both badges read the **same source**; both read the same *wrong* source. Consistency proven, correctness never checked | `components/DomainCountParity.test.ts:12-23` |
| S5 | `verify-equipment-types-no-collision` selftest | the selftest asserts the script "passes when DATABASE_URL is unset (**skip**)" — asserting that it does **not run**. Also triple-wired (package.json + verify-guards + ci.yml) against Rule 17 | `scripts/__tests__/verify-equipment-types-no-collision.test.mjs` |
| S6 | `verify-catalog-factory-coverage.mjs` | **backend-only** — never opens `apps/frontend`. `GENERIC_CATALOG_REGISTRY` has **1** entry while migrations create **63** `catalogs.*` tables, so "catalog wired on the backend but unrenderable in the UI" passes | `scripts/verify-catalog-factory-coverage.mjs:8,122-140`; `apps/frontend/src/hooks/useCatalogQuery.ts:86-108` |
| S10 | `verify-safety-count-nav-integrity.mjs` + `verify-safety-tab-coverage.mjs` | string-match a `28`/`9` constant across 5 files and check exactly **one** hardcoded link; neither reads `sidebar-config.ts` or any router. A tab added to config but never linked from nav — **mounted-but-unlinked**, the SAF-F22 class — passes both | `verify-safety-count-nav-integrity.mjs:39-44,62`; `verify-safety-tab-coverage.mjs:87-90` |

## SILENT-SKIP CLASS — **CORRECTED 2026-07-25, my first pass overclaimed**

The original entry listed 6 guards as silently skipping. That was wrong and is corrected here,
because it would have sent work at 4 guards that are fine. `ci.yml`'s `build-typecheck` job runs a
real postgres service and applies migrations via `verify:pre-commit` **before** these guards, and it
exports `DATABASE_URL`/`DATABASE_DIRECT_URL`. So their no-DB branch is dead code in CI and their DB
branch genuinely executes:

- `verify-csa-score-pull-recency.mjs` (ci.yml:241) · `verify-fmcsa-safer-customer-coverage.mjs`
  (ci.yml:247) · `verify-launch-toggle-audit-trail.mjs` (ci.yml:286) ·
  `verify-usmca-seed-completeness.mjs` (ci.yml:283) — **all four DO run their DB checks.**
  (Some trivially pass on an empty fresh-CI table — a legitimate no-data case, not a fake pass.)

**Only TWO are genuinely never-run, and both are real holes:**

| # | Guard | The hole |
|---|---|---|
| S11 | `scripts/verify-coa-roles.mjs` | **Never invoked in CI at all** — no `package.json` script, no `ci.yml` step, no `verify-steps/` entry. Already baselined in `scripts/.guard-exempt.json:89`: *"pre-existing standalone guard; wire into verify:pre-commit/workflow or justify individually"*. It has simply never protected anything. **Accounting/CoA subject matter — flagged to Cursor's lane, not wired here.** |
| S12 | `scripts/verify-no-test-units-in-prod.mjs` | Wired (via `verify:arch-design` → verify-step 05) and CI **does** supply `DATABASE_URL`, but the DB branch additionally requires `ENABLE_LIVE_DB_UNIT_TEST_GUARD=true`, which **no workflow ever sets** (`grep` across `.github/workflows/*.yml` → zero hits). So the live check has **never executed**; only the static branch runs, while the output still reads `OK`. |

**The lesson for this register:** "prints OK without a DB" is a *symptom*, not the finding. The finding
is whether CI actually reaches the substantive branch. Four guards looked guilty and were innocent.
Verify the CI job's env before calling a guard dead.

## INERT SELFTESTS

The repo already has a meta-guard: `scripts/verify-selftests-can-fail.mjs`, with
`scripts/selftests-can-fail-known-debt.json` listing **8** known-inert selftests (shrink-only ratchet):
`verify-banking-inline-create` · `verify-compliance-tabs-url-sync` ·
`verify-dispute-queue-entitylink-reverse` · `verify-faro-import-linkage` ·
`verify-finance-landing-hub` · `verify-owner-home-linkage` ·
`verify-pre-settlements-reverse-drill` · `verify-reference-dropdown-inline-create`.

**The meta-guard itself is shape-based** (S9): its `classify()` treats "calls a function matching
`/assert\w*|check\w*|run\w*/`" as proof of substance. `verify-no-guard-hotfile-thrash.mjs:68-69`
calls the real assertion but only asserts `Array.isArray(errs)` — trivially always true — so it
passes the classifier while remaining unable to fail. **Treat 8 as a floor, not a ceiling.**

## Guard wiring gaps (Rule 17)

- `scripts/verify-accident-wizard-catalogs.mjs` (#3384) — **no verify-step**. Already tracked in
  `scripts/.guard-exempt.json` as known debt: "package.json script exists but no CI workflow/
  verify-steps execution". No `--selftest`.
- `scripts/verify-phantom-relations.mjs` (#3380) — no verify-step, but **does** run via
  `.github/workflows/closure-checks.yml`. Not a hole; a second wiring mechanism.

Otherwise **21 of 22** Safety-batch PRs ship guards properly wired via `verify-steps/` with selftests
that mutate real source — that half of the standard is being met.

## Method for each fix

1. Capture the **real pre-fix source** (committed fixture, or replay against `origin/main`).
2. Prove the tightened guard **fails** on it and **passes** on the corrected shape.
3. Assert the corrected shape is **not** flagged — false positives burn trust as fast as misses.
4. Wire via `scripts/verify-steps/NNNN-*.mjs` only. Never `package.json`. Never edit `ci.yml` to pass.
