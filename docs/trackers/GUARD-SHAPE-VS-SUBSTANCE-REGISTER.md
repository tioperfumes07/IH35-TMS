# Guard audit — shape vs substance (open register)

**Owner directive 2026-07-24:** *"audit the guard suite for shape-vs-substance … These are the same
disease. List them; we tighten them one at a time."*

**The disease:** a guard that asserts the *shape* of compliance (a keyword is present, two things
match each other, a file exists) rather than the *substance* (the defect is actually absent). Such a
guard is worse than no guard — it converts an unchecked risk into a false assurance, and it is why
CI stayed green through a deploy outage and through five non-reviewable PRs on the same day.

**Diagnostic question for every guard:** *if the exact defect this guard is named for were present
right now, would this guard fail?* If the honest answer is "not necessarily", it is on this list.

**Rule:** tighten one at a time. Each fix must FAIL on the real pre-fix source (a committed fixture,
not a synthetic literal) and PASS on the corrected shape. Never weaken a guard to go green.

---

## CONFIRMED — evidence recorded

| # | Guard | The shape it checked | The substance it missed | Status |
|---|---|---|---|---|
| S1 | `verify-definition-of-done-evidence.mjs` | keyword *anywhere* in the commit message: `/guard/i`, `/(live proof\|verified\|…)/i`, `/\bfix\b/` (auto-passes any `fix(scope):` subject). `REMAINING` absent from `EVIDENCE_KEYS` entirely. Reads commits over `merge-base..HEAD` — **empty on main** — never the PR body or squash message. | 5 merged PRs (#3397/#3403/#3405/#3408/#3409) carried **zero** evidence-block sections and went green. DoD §3 ("required in every PR body") was unenforced by construction. | **FIXED** — labelled lines + `REMAINING` + artifact requirement + new `check-pr-evidence-body.mjs` reading `$GITHUB_EVENT_PATH`; 5 real PR bodies committed as pre-fix fixtures |
| S2 | `verify-no-hardcoded-list-counts.mjs` | scans **4 frontend hub files** for literal JSX count props | the live hardcode is in the **backend** (`lists-module-count-spec.ts:96`, `ACCOUNTING_JOURNAL_ENTRY_TYPES_COUNT = 3` against a real 16-row table). The guard named for this defect class cannot see it. | **OPEN** — LST-B01 |
| S3 | `DomainCountParity.test.ts` | asserts the ribbon badge and map badge read the **same source** | both read the same *wrong* source. Consistency proven; correctness never checked. 9 live catalogs absent from the count spec; TRANSP understated by 548 active rows. | **OPEN** — LST-B03 |
| S4 | migration "reject edited applied migrations" | CI-internal from-0001 consistency | **not prod-ledger parity** — 910 drifted from the prod ledger, CI stayed green, and every deploy pre-deploy-failed. | **FIXED** — #3418 pins a prod-ledger checksum manifest (step 1421) |
| S5 | `verify-equipment-types-no-collision` selftest | `scripts/__tests__/…` asserts the script "passes when DATABASE_URL is unset (**skip**)" | a selftest whose asserted behaviour is *not running* proves nothing about the assertion. Also triple-wired (package.json + verify-guards + ci.yml) against Rule 17. | **OPEN** — LST-F11 |

## SUSPECTED — needs the diagnostic run, do not assume

| # | Guard | Why suspected |
|---|---|---|
| S6 | `verify-catalog-factory-coverage.mjs` | passes ("38 tables wired") while `GENERIC_CATALOG_REGISTRY` has **1** entry — it checks backend coverage, not the frontend registry the user actually hits (lists.md LST-F18). |
| S7 | `verify-canonical-table-writes.mjs` | declares `load_cancellation_reasons` = RETIRE / `cancellation_reasons` = canonical — the **opposite** of the migrations — and passes only because 6 writes sit in `.canonical-write-exempt.json` (LST-F17). A guard asserting the wrong canonical direction. |
| S8 | `lists-counts` `to_regclass` skip | a missing table silently degrades the count instead of failing — plausible smaller number, no signal (same class as the recon collector's green-on-no-data). |
| S9 | Any guard whose `--selftest` compares two string literals declared inside the script | structurally incapable of failing. Sweep the suite for this shape and count them. |
| S10 | `verify-safety-*` count/coverage guards | assert counts against `SAFETY_TABS_CONFIG.ts`; confirm they fail when a tab is *mounted but unlinked* (the SAF-F22 class), not merely when the number changes. |

## Method for each fix

1. Capture the **real pre-fix source** as a committed fixture (`scripts/__fixtures__/…`).
2. Prove the tightened guard **fails** on it and **passes** on the corrected shape.
3. Assert the corrected shape is **not** flagged — false positives burn trust as fast as misses.
4. Wire via `scripts/verify-steps/NNNN-*.mjs` only. Never `package.json`. Never edit `ci.yml` to pass.
