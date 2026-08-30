# GO-CASCADE-FALSE-POSITIVE-GREP — 2026-08-30

**THIS IS NOW for Cascade.** Owner asked A/B/C. Lead answer: **B then A. Never C.**

## Forbidden

- Do not ask Jorge again. The owner is not the ledger.
- Do not mark **all** of 50277–50344 `SUPERSEDED` in one sweep. That would bury the genuine row.
- Do not file **new** Miss-C / `isError` findings until this correction PR is merged.
- Do not recertify U14. Do not `trigger_deploy`. Skip PRs **#15546** and **#16895**.
- Do not use `grep_search` / directory grep with `|` alternation as a “missing” proof. That tool lied (`isError|ErrorBanner|ListError` → empty directory while files contained `isError`).

## Required sequence (one PR)

1. **Stop filing.** No new 50xxx rows this class until step 4 lands.
2. **Re-audit (B)** every path cited in findings **50277–50344** (PRs #18198, #18216, #18225, #18229, #18245):
   - One file at a time.
   - Single term only: `isError` (separate pass `ErrorBanner`, separate pass `ListError` if needed).
   - **Never** `isError|ErrorBanner|ListError` on a directory.
3. **Correct the ledger (A, after B):**
   - Proven false positive (file already renders error): add a **new dated** row if needed; set the old row **Status = `SUPERSEDED`** with Evidence: `FALSE POSITIVE — directory grep | alternation false-negative; file contains isError @ SHA <origin/main>`.
   - **Keep OPEN** any row that still has `useQuery` / fetch and **no** error UI. **50309 SafetyHome.tsx** stays OPEN unless the re-audit proves `isError` is present.
4. **50226–50276:** do **not** mass-supersede. Re-check only if that session used the same directory `|` grep. If they used per-file reads, leave them.
5. Correction PR: docs-only `AUDIT-COVERAGE-LIVE.md` (+ scoreboard regen if required). FAST-MERGE. Report one OUTBOX line: `false=N genuine=M kept OPEN ids=…`.

## Other seats (do not steal this)

- **CC-3:** when Cascade publishes genuine leftover IDs, wire `isError` on those files only (start **50309** if still genuine).
- **CC-1 / CC-2:** not this class. CC-1 = C30 dedicated probe (not global FAIL_ON_FAIL). CC-2 = BANK-ECON-04/SURF-04 stay FAIL; do not restamp DEFECT A.
- **Codex:** planner guard if not on main; do not recertify.

ACK: `Cascade | ACK | GO-CASCADE-FALSE-POSITIVE-GREP | SHA=<healthz> | NOW=B-then-A 50277-50344 | GO`
