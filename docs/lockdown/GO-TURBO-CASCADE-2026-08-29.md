GO-TURBO — CASCADE (GUARD-2 · non-money audit)
Issued 2026-08-29 20:30Z · TURBO · Target: Urgent 6 + U14 ACCOUNTED FOR by 2026-08-30
Supersedes all earlier GO-TURBO docs and the overlay. All corrections are baked in.

## CURRENT STATE — verified 20:25Z. DO NOT WAIT FOR ANYTHING.
LIVE_SHA = ecd3afd    deploy dep-da9jrs142hec7384pt1g · status live · finished 20:20:08Z
THE DEPLOY ALREADY HAPPENED. START NOW. Verified independently: "[matrix] worker last-good ready"
at 20:23:02Z — the matrix projection completed for the FIRST TIME, zero "worker projection failed"
after 20:20. MATRIX-01 is fixed and LIVE.
Bindable now on the deployed ancestry: MATRIX-01 4f0ae19c8 · GUARD-ROT board e34667da9 ·
#17604 DRV-F7314 0387d3a21.  origin/main is ~3 ahead; next deploy rides the 5-10 PR cadence.

## THREE CORRECTIONS BEFORE YOU START
1. THE MERGE LAW IS DOCUMENTED. You reported "the 4 minute fast weekend merge method isn't
   documented in the repo." It is: docs/bus/FAST-MERGE-4MIN-LAW.md on origin/main, titled
   "FAST MERGE · 4-5 MINUTES · OWNER LOCKED · 2026-08-12." Referenced from 10+ files including two
   audit packs written FOR YOU: docs/audit/CASCADE-DEVIN-CERTIFIED-U14-AUDIT-PACK-2026-08-23.md and
   docs/audit/CASCADE-DEVIN-VERTICAL-CERTIFIED-AUDIT-INSTRUCTIONS-2026-08-23.md.
   It is named for the 4 MINUTES, not the weekend. READ IT BEFORE YOUR NEXT PUSH.
2. git push --no-verify IS AUTHORIZED by that law, step 2, verbatim: "If push dies ONLY at
   verify-static-fallback on the ENV-VERIFY-STATIC class (not your guard/selftest) ->
   git push --no-verify — authorized; not bypassing step 1."
   TWO CONDITIONS YOU MUST NOT SKIP:
   a. --no-verify skips the PUSH HOOK, not the GATE. money-pr-local-gate.mjs exit 0 first.
   b. PROVE the reds are pre-existing. "It's docs-only so it can't be mine" is an ASSUMPTION, and
      some guards read docs/bus and board files. 90 seconds:
        git stash -u
        git checkout --detach origin/main
        node scripts/verify-static.mjs 2>&1 | grep -Ei 'fail' | sort > /tmp/main-reds.txt
        git checkout - && git stash pop
        node scripts/verify-static.mjs 2>&1 | grep -Ei 'fail' | sort > /tmp/branch-reds.txt
        diff /tmp/main-reds.txt /tmp/branch-reds.txt
      Empty diff -> authorized. PASTE THE DIFF IN YOUR PR BODY as the authorization evidence — that
      makes it a documented exception instead of an unexplained bypass.
      Any line only in branch-reds -> THAT ONE IS YOURS. Fix it. Do not push around it.
3. NEVER USE THE GITHUB CONTENTS API TO PUSH AGAIN. You did that on #16891 and #16895 because the
   hook was red. Both sat stranded 35+ HOURS and had to be re-landed by Cursor as #17683. The
   Contents API skips the LOCAL GATE — the one thing that is actually load-bearing. --no-verify
   skips a hook that is red for reasons unrelated to you. NOT THE SAME RISK.

## YOUR FINDING WAS RIGHT AND IT IS NOW A BOARD ROW
VERIFY-STATIC-RED-211-ON-MAIN was your work and it was correct: 211 failures — 14 registry
thresholds, 97 rotted selftests, 100 normal-mode. Now on the board as VERIFY-STATIC-SELFTEST-STALE-97
and ECON-002-DRIVER-ADVANCES-DENSITY-STALE, landed via #17683. One of the three most important
things found today.

## WAVE 1 — RE-MEASURE THE 211. HIGHEST-VALUE THING YOU CAN DO TONIGHT.
Main has moved ~70 commits since your measurement at 61dac4f3. NOBODY KNOWS TODAY'S NUMBER.
Re-run node scripts/verify-static.mjs on current origin/main. Publish today's count and the same
three-lane breakdown (registry / rotted selftest / normal-mode). Hand it to Cursor as the seed for
the GR-1 ratchet baseline: docs/audit/VERIFY-STATIC-BASELINE.json holding NAMES, NOT A COUNT
(a count lets one guard be fixed while another rots in silently).
The ratchet cannot ship without an accurate current list, and until it ships every guard fix is
undone by the next PR that lands a new red.

## WAVE 2 — AUDIT THE 15 FAKE complete:true FLAGS (non-money)
15 modules flagged complete:true. NOT ONE fully bound. SEVEN with ZERO bound evidence:
  compliance 0/9 · customers 0/10 · fleet 0/7 · fuel 0/9 · home 0/1 · program 0/7 · tasks 0/5
Others: eld 1/5 · insurance 1/6 · legal 1/12 · lists 1/23 · safety 1/38 · maintenance 1/39 ·
cash-flow 1/3 · driver-hub 1/7.
For each write a verdict WITH LIVE EVIDENCE: bindable now (hand the owning seat the exact query),
or REOPEN (the flag is false, say why). DO NOT FLIP FLAGS YOURSELF — CC-2 owns that. You produce
the evidence that forces the decision.
START WITH maintenance (39 items, 1 bound) and safety (38 items, 1 bound) — the two biggest lies
on the board.

## WAVE 3 — THE 100 NORMAL-MODE FAILURES ARE PRESUMED REAL
Every one gets a written verdict: REAL DEFECT (fix, guard stays) or GUARD IS WRONG (fix the guard
and prove the old assertion was incorrect WITH A LIVE QUERY). "Environment" is a verdict that
requires evidence, not a shrug — the ECONNREFUSED 127.0.0.1:59999 class is real but it is not 100
guards' worth.
NOTE: verify-units-no-operating-company-id is ALREADY FIXED on main (arriving-soon.routes.ts now
uses COALESCE(u.currently_leased_to_company_id, u.owner_company_id)). If that guard still fails,
the GUARD is stale, not the code. Expect more of these — verify before filing.

## LANE BOUNDARY
Non-money audit. You do NOT flip prod_verified or edit module-completion JSON (CC-2). You do NOT
fix money items (CC-1). You do NOT deploy. Findings only on anything in another seat's lane.

## DONE
Today's verify-static count published with the three-lane breakdown · ratchet baseline handed to
Cursor · all 15 fake complete flags carrying a live verdict · the 100 normal-mode failures triaged ·
ZERO Contents-API pushes.

## RECIPE A — THE L6 STAMP (how an item becomes real)
BOUND = prod_verified:true AND live_verified_sha AND live_verified_at, AND that SHA is an
ANCESTOR of live healthz. Nothing else counts.
  1. curl -s https://api.ih35dispatch.com/api/v1/healthz/shallow      -> version (now: ecd3afd)
  2. git merge-base --is-ancestor <SHA> <LIVE_SHA> && echo BINDABLE || echo NOT-BINDABLE
     For a merged PR use the SQUASH COMMIT on main, NOT the branch head:
       git log origin/main --format='%H %s' | grep '(#NNNNN)'
  3. If BINDABLE: produce live evidence (Recipe B) and hand it to CC-2.
  4. CC-2 ONLY writes the stamp into docs/module-completion/<module>.json + shrinks
     PROD-VERIFIED-BINDING-BASELINE.json. evidence = the PASTED live result, never a description.
  5. node scripts/verify-prod-verified-live-binding.mjs   bound UP, baseline DOWN. NEVER up.

*** AN UNBOUND prod_verified ITEM IS AN UNVERIFIED CLAIM, NOT A PENDING STAMP. ***
Run the live query FIRST. If the live result does not match the claim, REOPEN it — do not stamp it.
Rubber-stamping the backlog to move the number is the same defect that created this mess.
EXPECT SOME TO REOPEN. That is a good outcome, not a miss.

## RECIPE B — READING PROD WITHOUT THE FALSE-EMPTY TRAP
Neon project tiny-field-89581227, branch br-fancy-credit-akjnd07a.
USMCA 5c854333-6ea5-4faa-af31-67cb272fef80 · TRANSP 91e0bf0a-133f-4ce8-a734-2586cfa66d96
· TRK b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e
Run as SEPARATE statements in one transaction:
    BEGIN
    SET LOCAL app.bypass_rls='lucia'
    SELECT (SELECT count(*) FROM accounting.journal_entries) AS je_control, ...your query...
    COMMIT
NEVER use the "WITH b AS (SELECT set_config(...))" CTE form — it silently does not apply and you
get an empty result that looks like "no data" but is RLS hiding rows. Pool alternates current_user
between neondb_owner and ih35_app. je_control was 2212 at 19:32Z; if it returns 0 your bypass did
not apply and EVERY number in that result is garbage. Re-run. Do not report it.

## RECIPE C — FAST-MERGE, EVERY SHIP, 4-5 MINUTES  (docs/bus/FAST-MERGE-4MIN-LAW.md)
  1. node scripts/money-pr-local-gate.mjs           exit 0 = merge proof
  2. git push    (dies ONLY at verify-static-fallback on the pre-existing ENV-VERIFY-STATIC class?
                  git push --no-verify is AUTHORIZED)
  3. gh pr create ...
  4. gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash
     <<< SAME TURN, SAME 15 SECONDS. NOT A LATER TURN.
  5. OUTBOX one line -> next item
BEFORE starting any new item: gh pr list --author @me --state open  -> merge those first.
An open PR is unshipped work. Eleven CC-1 PRs sat open 2+ hours today because step 4 was skipped.
No gh pr checks --watch. No waiting for CI. No asking Jorge. No GitHub Contents API (that is how
#16891/#16895 got stranded 35 hours).
Merge on gate exit 0. Never merge through a red YOUR DIFF introduced — fix it. A red already
failing on origin/main before your branch existed is NOT YOURS: name it in the PR body and merge.

## HARD RULES — ALL SEATS
 1. Never trigger_deploy. Cursor only (Rule 42). Need one? Say so in OUTBOX.
 2. RULE 17 — NEVER edit package.json, .github/workflows/ci.yml, or locked-guards.yml to wire a
    guard. That is the serialize treadmill: each such PR conflicts every other open PR. Wire guards
    as scripts/verify-steps/NNNNN-<name>.mjs with a CLAIMED step number in your lane band.
 3. Never bulk-void TEST/sample/demo data. Owner law. Keep until one post-launch pass.
 4. Never weaken a guard to make it pass. Re-anchor its mutation, or retire it and NAME the
    successor. A selftest that plants nothing is not a check.
 5. ONLY CC-2/GUARD writes a prod_verified stamp or edits docs/module-completion/*.json.
    Every other seat produces evidence and hands it over. Two seats in one JSON = hotfile war.
 6. Never claim done without pasted live evidence. Code-reading is not verification.
 7. A block with no linkage declaration is not done (Rule 14).
 8. USMCA is the launch entity. TRANSP/TRK do not gate launch.
 9. Empty TMS tables are EXPECTED. Say "genuinely zero, je_control=N" — not "bug".
10. VERIFY BEFORE YOU BUILD. Main moves fast. Confirm your assigned fix is STILL BROKEN on current
    origin/main first. Two assignments in v1 of this pack were already shipped. If already fixed,
    re-run the guard — if the guard still fails, the GUARD is stale: re-anchor it, do not touch
    working code.
11. Cannot finish an item? It gets a DATED FINDING WITH AN OWNER. Never a silent skip, never a
    downgraded claim, never a fake PASS.

## WHAT "READY" MEANS
Every item is either BOUND (Recipe A) or carries a DATED FINDING naming what blocks it and who
owns it. Nothing unexplained. "Green" is not the bar; ACCOUNTED FOR is. All-green by 9am is not
the goal — forcing it manufactures exactly what we spent today digging out of.
