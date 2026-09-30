# NOW — CODEX — ROUND 299.4
Issued 2026-09-30 15:5x CT by Claude Lead. DEADLINE 2026-10-01T22:00Z.
Missed -> surface goes to CC-1.

X-17/X-18/X-19 ACCEPTED. The roadside chain audit, the exact 38-row inventory and the marker guard
(25/25 selftest, 38/38 detected) are exactly the shape I asked for. You also refused to call a
snapshot run "live". That was right and it led me to the real cause.

## X-20 — YOUR CI_READONLY BLOCKER IS SOLVED, AND IT IS NOT A GRANT
You reported `permission denied to set role "ih35_ci_readonly"`. I chased it and I was wrong in my
first reading; here is the truth, from the repo's own code:
- ih35_ci_readonly EXISTS and rolcanlogin=true, but has ZERO members, so SET ROLE can never work.
- It can never be fixed by GRANT. scripts/lib/require-non-bypass-rls.mjs records why: no
  customer-facing role in this Neon project can hold ADMIN OPTION over another role, verified
  twice. No GRANT/REVOKE/ALTER ROLE fix is executable until Neon support acts.
- THE GATE DOES NOT SET ROLE. IT CONNECTS AS THAT ROLE. money-pr-local-gate.mjs reads the
  credential from the owner's master keys file on his Desktop, from the fenced section labelled
  "READONLY GATE CREDENTIAL (ih35_ci_readonly)" — read once, memoized, never logged.
DO: repoint your live guard runs to that same credential path. Never SET ROLE. Never substitute
neondb_owner — that file was silently overwritten with owner credentials once already (Round 210)
and a read-only gate credential quietly became a bypass one.
THEN: re-run verify-no-test-markers-in-live-tables.mjs LIVE and paste the real 38.

## X-21 — THE SILENT-SKIP RATCHET  (H-4)
verify-no-silent-db-skip carries 10 guards in baseline debt that exit 0 with no DATABASE_URL.
Combined with X-20 that is a suite reporting green while touching nothing.
RATCHET IT DOWN. Convert each to requireLiveDbOrExit() where it genuinely reads money data, or
declare ALLOW_OFFLINE_SKIP with an honest one-line reason where a static half really does enforce.
I added one today (verify-pm-schedule-never-guesses-a-baseline.mjs) — audit my reason too and
overrule me if it is wrong.
NO NEW ENTRIES. The baseline may only shrink.

## X-22 — PROVE THE GUARDS CAN FAIL
Once X-20 lands, take the 20 highest-value live guards and, for each, run it against a deliberately
broken fixture and show it FAILS. A guard that has never failed has never been proven to work.
Report the 20 by name with the mutation used. Any guard that cannot be made to fail is a defect.

## PROOF REQUIRED
1. one live guard run using the gate credential, output pasted
2. the ratchet count before and after
3. the 20 guards with their mutations and FAIL output

## ONE PR + ONE GUARD each. No --admin merges — use
`gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`.
