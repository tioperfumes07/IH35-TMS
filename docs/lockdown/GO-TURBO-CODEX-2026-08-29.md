GO-TURBO — CODEX (dispatch · drivers · fleet · fuel, NON-MONEY)
Issued 2026-08-29 20:30Z · TURBO · Target: Urgent 6 + U14 ACCOUNTED FOR by 2026-08-30
Supersedes all earlier GO-TURBO docs and the overlay. All corrections are baked in.

## CURRENT STATE — verified 20:25Z. DO NOT WAIT FOR ANYTHING.
LIVE_SHA = ecd3afd    deploy dep-da9jrs142hec7384pt1g · status live · finished 20:20:08Z
THE DEPLOY ALREADY HAPPENED. START NOW. Verified independently: "[matrix] worker last-good ready"
at 20:23:02Z — the matrix projection completed for the FIRST TIME, zero "worker projection failed"
after 20:20. MATRIX-01 is fixed and LIVE.
Bindable now on the deployed ancestry: MATRIX-01 4f0ae19c8 · GUARD-ROT board e34667da9 ·
#17604 DRV-F7314 0387d3a21.  origin/main is ~3 ahead; next deploy rides the 5-10 PR cadence.

## YOU ARE THE THROUGHPUT BENCHMARK. DO NOT SLOW DOWN.
Measured today across 20 PRs: MEDIAN 9 SECONDS create-to-merge, worst 12s, ZERO over the 4-minute
law, ZERO left open. Every other seat is being held to your number. Keep doing exactly this.

## VERIFY FIRST — THE 42703 I ASSIGNED YOU IS ALREADY FIXED
apps/backend/src/maintenance/arriving-soon.routes.ts now uses
  COALESCE(u.currently_leased_to_company_id, u.owner_company_id)
at lines 182 and 414. ZERO occurrences of u.operating_company_id remain. The column defect is GONE.
*** RE-RUN verify-units-no-operating-company-id.mjs. DO NOT "FIX" A COLUMN THAT NO LONGER EXISTS. ***
If the guard still fails, the GUARD is stale — RE-ANCHOR it (see Wave 5). Do not touch the route.
This is Hard Rule 10 in practice: main moves fast, verify before you build.

## WAVE 1 — EVIDENCE FOR 13 UNBOUND CLAIMS (you evidence; CC-2 stamps)
prod_verified:true with no live SHA. These are CLAIMS, NOT PENDING STAMPS. Run the live query
against ecd3afd; if live does not match, hand CC-2 a REOPEN, not a stamp.
  dispatch (6)  DISP-S19 DISP-S22 DISP-S26 DISP-S34 DISP-S35 DISP-S36
  fleet    (4)  FLEET-S01 FLEET-S04 FLEET-S05 FLEET-S06
  fuel     (3)  FUEL-S04 FUEL-S05 FUEL-S09

## WAVE 2 — DISPATCH. 31 items. Largest unproven block in the Urgent 6.
  DISP-S01 S02 S03 S04 S05 S06 S07 S08 S09 S10 S11 S12 S13 S14 S15 S16 S17 S18
  DISP-S20 S21 S23 S24 S25 S27 S28 S29 S30 S31 S32 S33 S37
Dispatch is 0 BOUND of 37 — the biggest zero in the Urgent 6. Work in numeric order so progress is
legible to every other seat. Each: real fix, guard with planted selftest, live proof pasted,
FAST-MERGE, next.

## WAVE 3 — DRIVERS. One real FAIL plus 9 unproven.
  DRV-S04  *** STATUS = FAIL *** profile navigation. FIX THIS FIRST. It is the only declared FAIL
           in drivers, and drivers is otherwise 10/20 bound — the second-best module in the program.
  DRV-S12 S13 S14 S15 S16 S17 S18 S19 S20
Clearing DRV-S04 plus these nine makes drivers the second fully-bound module after vendors.

## WAVE 4 — FLEET / FUEL REMAINDER
  fleet  FLEET-S02 FLEET-S03 FLEET-S07
  fuel   FUEL-S01 FUEL-S02 FUEL-S03 FUEL-S06 FUEL-S07 FUEL-S08
Both modules are flagged complete:true with ZERO bound items today. That flag is theater until you
bind them. Do NOT treat the flag as permission to skip.

## WAVE 5 — YOUR SHARE OF THE 97 STALE SELFTESTS
Split with CC-3: YOU take dispatch / drivers / fleet / fuel guards. CC-3 takes everything else.
Post your domain claim in OUTBOX before starting so you never collide.
Same hard rule: a rotted selftest is NEVER fixed by making it pass trivially. Deleting the mutation,
weakening the assertion, or skipping it turns the check green while removing the protection.
  RE-ANCHOR (PR body cites OLD SITE -> NEW SITE)  or  RETIRE (name the successor, or why none).
Wait for Cursor's GR-1 ratchet so your fixes shrink a tracked baseline.
WIRE ANY NEW GUARD AS scripts/verify-steps/NNNNN-*.mjs. NEVER ci.yml / package.json (RULE 17).

## LANE BOUNDARY
NON-MONEY ONLY. Anything touching GL, postings, invoices, bills, settlements, factoring or bank
goes to CC-1 as a FINDING — do not fix it yourself. You do NOT write prod_verified stamps or edit
module-completion JSON (CC-2). You do NOT deploy.

## DONE
13 claims evidenced (bound or REOPEN) · dispatch 31 each BOUND or FINDING'd · DRV-S04 fixed ·
fleet/fuel remainder closed · your domain's stale selftests re-anchored or retired with sites cited ·
verify-units guard re-run and its true state reported.

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
