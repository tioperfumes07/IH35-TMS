# ROUND 205 — MERGED IS NOT LIVE. VERIFY THE DEPLOY. (owner 2026-09-28)

**Cause measured:** 4 consecutive frontend Render builds failed (`srv-d7s46dbrjlhs7383i150`)
20:03–20:14 UTC because `pushToast({kind,message})` object-form in CheckDetailPage /
CheckPrintPage (#23040) broke `tsc -b` before `vite build`. One FE type error kills the
entire app bundle for every seat. Fixed #23067 `c005b0e1`; live again 20:17:25 UTC on
`39cd3c91`.

## LAW (every seat, every PR, no exceptions)

1. Before opening a PR that touches `apps/frontend`, run BOTH and paste exit codes:
   - `cd apps/frontend && npx tsc -b`
   - `cd apps/backend && npx tsc -p tsconfig.json --noEmit`
   Zero new errors vs clean `origin/main` baseline.

2. After merge, do NOT report DONE until Render deploy for THAT commit is status
   **live**. Not merged. Not green checks. Paste deploy id + commit sha + status.

3. If your commit's deploy is `build_failed`, that is YOUR blocker — fix in-session under
   one-permitted-interruption even if the error is in a file you did not touch.

4. Nobody reports "shipped" / "deployed" / "live" on the strength of a merge. LIVE =
   owner can open Chrome and click it. Claim of live without a live deploy id = fake green.

5. Never disable, skip, or baseline a type error to get a build through. Fix root cause.
