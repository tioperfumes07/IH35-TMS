GO-TURBO — DEVIN (customers · then inventory / users / form_425)
Issued 2026-08-29 20:30Z · TURBO · Target: Urgent 6 + U14 ACCOUNTED FOR by 2026-08-30
Supersedes all earlier GO-TURBO docs and the overlay. All corrections are baked in.

## CURRENT STATE — verified 20:25Z. DO NOT WAIT FOR ANYTHING.
LIVE_SHA = ecd3afd    deploy dep-da9jrs142hec7384pt1g · status live · finished 20:20:08Z
THE DEPLOY ALREADY HAPPENED. START NOW. Verified independently: "[matrix] worker last-good ready"
at 20:23:02Z — the matrix projection completed for the FIRST TIME, zero "worker projection failed"
after 20:20. MATRIX-01 is fixed and LIVE.
Bindable now on the deployed ancestry: MATRIX-01 4f0ae19c8 · GUARD-ROT board e34667da9 ·
#17604 DRV-F7314 0387d3a21.  origin/main is ~3 ahead; next deploy rides the 5-10 PR cadence.

## VENDORS IS FINISHED FOR YOU — 7/7 BOUND. DO NOT TOUCH IT.
Vendors is the first fully-bound module in the program: VEND-S01 VEND-S02 VEND-S03 VEND-S04
VEND-S05 VEND-LINK-01 VEND-VERIFY-01, every item carrying a live SHA. Do not re-open it, do not
re-stamp it, do not touch it. CC-2 owns the final audit + Chrome certification.
CUSTOMERS IS YOURS ALONE. An earlier version of this pack also gave customers to CC-3 — that was
an error and it is corrected. CC-3 has dropped customers. You own it. Claim it in OUTBOX.

## WAVE 1 — CUSTOMERS. 10 items, ALL unbound, module flagged complete:true.
  CUST-S01 CUST-S02 CUST-S03
  CUST-CHROME-01 CUST-CHROME-02 CUST-CHROME-03
  CUST-LINK-01 CUST-LINK-02
  CUST-VERIFY-01
  LV-001
Customers is 0 BOUND of 10 while flagged complete — the second-worst fake flag in the program after
tasks. Every one needs REAL WORK plus live proof. NONE of these is an evidence-only item.
ORDER: CUST-S01..S03 (surfaces) -> CUST-LINK-01/02 (linkage) -> CUST-CHROME-01..03 (Live Chrome)
       -> CUST-VERIFY-01 -> LV-001
LV-001 NOTE: #17652 (CUST-REOPEN-2026-08-29) re-verified customers including LV-001, and #17658
found that FOUR earlier FAILs were WRONG-URL FALSE NEGATIVES. Read both before you re-test. Do not
re-file a FAIL that was already proven to be a bad URL. VERIFY THE URL FIRST, EVERY TIME.

## WAVE 2 — LINKAGE LAW. Customers touch the canonical hub tables.
Every customer record links BOTH WAYS to its financial primitives AND its operational modules.
HUB tables every record links back to:
  org.companies · identity.users · mdata.drivers · mdata.units · mdata.loads · catalogs.accounts
  mdata.customers · maintenance.work_orders · mdata.vendors · accounting.journal_entries
  docs.files · mdata.equipment
WRITE THE CANONICAL SIDE ONLY. NEVER WRITE THE RETIRED SIDE:
  CANONICAL (write)                      RETIRED (never write)
  driver_finance.*                   ->  payroll.*  AND  settlement.*
  mdata.qbo_*                        ->  accounting.qbo_*
  banking.*                          ->  bank.*
  maintenance.*                      ->  maint.*
  mdata.vendors                      ->  mdata.qbo_vendors
  mdata.loads (canonical hub, 59 refs)
  catalogs.load_cancellation_reasons ->  catalogs.cancellation_reasons
REPOINT THE WRITER, NEVER DRAG THE FK. A block with no linkage declaration is not done (Rule 14).

## WAVE 3 — AFTER CUSTOMERS, IN THIS ORDER
  inventory   evidence-only claims: INV-S01 INV-S02 INV-S03
              then real work: INV-CAT-01 INV-PICK-01 INV-LINK-01 INV-VERIFY-01
  users       evidence-only claims: USER-S01 USER-S03 USER-S04 USER-S05 USER-VERIFY-01
              then real work: USER-S02
  form_425    evidence-only claims: 425-S02 425-VERIFY-01
              then real work: 425-S01 425-ECON-01 425-LINK-01
The evidence-only items need NO NEW CODE — run the live query against ecd3afd (Recipe B) and hand
the result to CC-2. But they are CLAIMS, NOT PENDING STAMPS: if live does not match the claim, hand
CC-2 a REOPEN. You do NOT edit module-completion JSON yourself.

## DO NOT DEVIATE
Your lane is CUSTOMERS, then INVENTORY / USERS / FORM_425, in that order. Find a defect outside
that list? File a FINDING naming the owning seat. Do not fix it. DEVIN-A REMAINS VOID.
Claim each module in OUTBOX before starting so no seat collides with you.

## LANE BOUNDARY
No money items (CC-1). No prod_verified stamps or module-completion JSON edits (CC-2). No deploys.
No vendors.

## DONE
All 10 customers items BOUND or carrying a dated FINDING with an owner · the complete:true flag
either earned or REOPENed with evidence · inventory / users / form_425 evidence-only items handed
to CC-2 with live results.

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
