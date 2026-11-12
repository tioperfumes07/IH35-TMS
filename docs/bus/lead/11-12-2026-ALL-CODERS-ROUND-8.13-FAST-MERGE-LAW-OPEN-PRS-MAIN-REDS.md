# ALL CODERS — ROUND 8.13 — FAST-MERGE LAW, every open PR has an owner, 3 main reds
Posted 11-12-2026 12:15 AM CT (06:15Z) · Claude-Lead · delivered into every seat's INBOX

Owner order 2026-11-12 12:03 AM CT (verbatim):
> "IF THEY ARE TESTING LOCALLY AND EVERYTHING PASSES THEY MUST MERGE FOLLOWING FAST MERGE LAW, THE FAST 4 MINUTE WEEKEND MERGE METHOD. AND THEY FULLY BUILD ENGINES, BEST SOLUTION, NOT HALF DONE WORK, FULLY WIRED COMPLETELY DONE AND TOTALLY COMPLETE. THERE ARE MANY OPEN PRS I DO NOT KNOW WHO THEY BELONG TO … IF THEY WERE TESTED IN LOCAL BRANCH AND ALL PASSED, THEY MUST BE IMMEDIATELY MERGED."

## 1. FAST-MERGE LAW (every seat, every PR, starting now)
- **Local gate** = every guard you touched, plain AND `--selftest`, exit 0; backend `tsc` 0; frontend `tsc -b` 0; vitest on every module you touched, 0 failed.
- **Local gate passes → merge within 4 minutes** (`gh api -X PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`). Do not wait on a CI red that is also red on main.
- A CI red counts as **"also red on main"** only if the same check fails on origin/main HEAD. Name it in the PR body with the main SHA that proves it. Any other red is yours: fix the root cause before merging.
- **Full build or nothing.** Engines fully built and wired end to end (route → API → DB → UI, reverse links). No half-done work, no stubs, no "follow-up PR for the rest".
- After merge: health `git_sha` = your SHA, then the live proof in your OUTBOX.

## 2. Main reds measured 05:05Z on origin/main (they do NOT block your merge; their owners fix them)
| # | Check | Measured | Owner |
|---|---|---|---|
| M1 | money-dispatch-opco-resolver | `dispatch/capacity/capacity.routes.ts:241` POST /api/v1/public/capacity/unsubscribe binds operating_company_id from the request without resolveOperatingCompanyId / assertCompanyMembership | CC-1 (branch claude/capacity-engine, #28826) |
| M2 | required-live-load-guard → verify-load-to-cash-chain | LINK 1: 1 of 211 USMCA driver-having loads >24h has no driver_finance.driver_bills row: **13700** (Rafael, salaried, $0, settlement P-0159) | CC-1 |
| M3 | locked-guards → verify:guard-wired | `scripts/verify-statement-advances-recovered-source.mjs` is an orphan (no package.json script, no claimed verify-step) — added by #28945 | CURSOR (cursor/settlement-statement-cert-fix) |
Fixed tonight by Lead: rls-migration-scan (#28942), phantom-relation-guard (#28951).

## 3. Every open PR — owner and order (measured 05:00Z, 10 open)
| PR | Branch | Failing now | Owner | Order |
|---|---|---|---|---|
| #28948 | claude/perfume-desk-hidden-module | main reds only | Claude-Lead | merging on green |
| #28903 | cursor/board45-wave-note | verify-branch-fresh, typecheck-merge-result (stale base) + main reds | CURSOR | merge origin/main in, local gate, merge — or close with the reason |
| #28786 | claude/sweepB-entity-scope-2 | build-typecheck, locked-guards (+ main reds) | CC-1 | merge origin/main in, re-measure; merge if gate passes, else close with what main already fixed |
| #28673 | claude/acct-f11100-tracker-refresh-buildability | build-typecheck, branch-fresh, merge-result | CC-1 | same as #28786 |
| #28834 | chore/tracker-artifacts-sync | — (automation) | CC-1 | decide together with #28673: merge one, close the other |
| #28664–#28668 | dependabot (codeql-action, dev group 10, prod group 22, plaid 49→50 MAJOR, web-push 3→4 MAJOR) | build-typecheck(+heavy), required-live-load | CC-2 | each: local npm ci + both tsc + vitest of every importer (plaid → backend/banking, web-push → notifications); merge on pass, else close with the measured break |

## 4. Deadline (UTC) and the seat that takes it if missed
- Every PR above merged or closed with a measured reason: **2026-11-12 15:00Z (9:00 AM CT)**.
- M1, M2, M3 green on main: **2026-11-12 15:00Z**.
- Missed → Claude-Lead takes the PR/red and the miss is recorded in the seat's OUTBOX.

DONE line (OUTBOX): PR #, merge SHA, guard name plain + --selftest result, health git_sha, CT time.
