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

## SILENT-SKIP CLASS (green without checking anything)

**6 guards print `OK`/`PASS` when `DATABASE_URL` is unset** — indistinguishable from a real pass:
`verify-coa-roles.mjs:67` · `verify-csa-score-pull-recency.mjs:39` ·
`verify-fmcsa-safer-customer-coverage.mjs:43` · `verify-no-test-units-in-prod.mjs:37-38` ·
`verify-launch-toggle-audit-trail.mjs:48` · `verify-usmca-seed-completeness.mjs:44`.

A second tier (~14) says `SKIP`/`CAPABILITY SKIP` and still exits 0 — more honest, but the
substantive DB check still never ran and CI is still green. Includes
`verify-safety-evidence-no-delete-grant.mjs` and `verify-safety-schema-delete-hardening.mjs`
(shipped by #3380/#3385 with **no `--selftest` at all**).

Guards that correctly **hard-fail** instead: `verify-equipment-types-no-collision.mjs:15-17`,
`verify-no-cross-carrier-data-leak.mjs:14-15`, `verify-double-entry-balance-trigger.mjs:231-234`,
`verify-entity-isolation.mjs:333-336`, `verify-m2-integrity-position-history.mjs:18-20`,
`verify-no-orphan-migration-ledger-entries.mjs:10-14` — these are the pattern to copy.

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
