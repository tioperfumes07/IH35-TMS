GO-TURBO — CURSOR (deploy lieutenant / lanes / program guards)
Issued 2026-08-29 20:30Z · TURBO · Target: Urgent 6 + U14 ACCOUNTED FOR by 2026-08-30
Supersedes all earlier GO-TURBO docs and the overlay. All corrections are baked in.

## CURRENT STATE — verified 20:25Z. DO NOT WAIT FOR ANYTHING.
LIVE_SHA = ecd3afd    deploy dep-da9jrs142hec7384pt1g · status live · finished 20:20:08Z
THE DEPLOY ALREADY HAPPENED. START NOW. Verified independently: "[matrix] worker last-good ready"
at 20:23:02Z — the matrix projection completed for the FIRST TIME, zero "worker projection failed"
after 20:20. MATRIX-01 is fixed and LIVE.
Bindable now on the deployed ancestry: MATRIX-01 4f0ae19c8 · GUARD-ROT board e34667da9 ·
#17604 DRV-F7314 0387d3a21.  origin/main is ~3 ahead; next deploy rides the 5-10 PR cadence.

## YOUR #1 JOB: DEPLOY CADENCE. Every 5-10 merged PRs. NEVER past 10.
You just cleared a 66-commit freeze that had blocked all six seats for ~2 hours. Binding requires
live_verified_sha to be an ancestor of live healthz — while you are behind, NOBODY can certify
anything. Set a timer. In turbo mode the seats merge fast. Falling behind re-freezes the program.
This matters more than any code you could write tonight.

## VERIFY FIRST — TWO ITEMS I PREVIOUSLY ASSIGNED YOU ARE ALREADY SHIPPED
- MATRIX-01 FIX-3 is DONE. #17675 already ships meta.workerState / workerError / workerFailedAt
  (module-matrix.service.ts:1750-1752, 2254-2256) and the RED banner "SCOREBOARD PROJECTION FAILED
  — Boxes 2/3/4 are not computable. This is not progress and not launch truth."
  (ModuleMatrixSystemView.tsx:551-554, 715). DO NOT REBUILD IT.
- Confirm live instead:
    curl -s '<api>/api/v1/program/module-matrix?scope=system' | jq '.meta.honesty, .meta.workerState, .system.builtPct'
    meta.honesty must NOT contain REQUIRED-SEED · workerState must be "running" · builtPct non-zero
  If REQUIRED-SEED persists after deploy, that is a NEW defect — file it, do not retry blindly.

## WORK QUEUE
1. MATRIX-01 FIX-2 — make ledger integrity PR-BLOCKING. audit-coverage-scoreboard.mjs runs only
   post-merge today, so a PR that corrupts AUDIT-COVERAGE-LIVE.md merges GREEN and the worker dies
   silently — that is exactly how row 2238 killed 3,388 cells for hours.
   *** WIRE IT AS scripts/verify-steps/NNNNN-*.mjs. DO NOT TOUCH ci.yml / package.json (RULE 17). ***
   Must fail on: any row != 11 cells · ANY duplicate finding number · assertParsedRowCountMatchesMax
   mismatch. Planted-failure selftest for EACH arm independently or it is not a guard.
2. GR-1 STATIC RATCHET — verify-static-ratchet with docs/audit/VERIFY-STATIC-BASELINE.json holding
   failing guard NAMES, not a count (a count lets one guard be fixed while another rots in
   silently). Fails if a guard not in the baseline fails, or if the baseline GROWS. Shrink-only.
   Claim 10042 was already in progress — use it. Again: verify-steps, NOT ci.yml.
   SHIP THIS BEFORE ANYONE REPAIRS A SINGLE GUARD — otherwise every repair is undone by the next PR.
   Seed the baseline from Cascade's fresh count, not the stale 211.
3. LANE ARBITRATION — verify no two seats hold the same module. Collisions get settled by you in
   OUTBOX immediately. Customers = DEVIN only. CC-3 does not touch customers.

## LANE BOUNDARY
No money items (CC-1). You do NOT flip prod_verified (CC-2). You do NOT repair the 97 stale
selftests (CC-3/Codex).

## DONE
Deploy cadence held under 10 PRs all night · matrix verified non-REQUIRED-SEED live ·
FIX-2 + GR-1 merged via verify-steps with planted selftests · zero lane collisions.

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
