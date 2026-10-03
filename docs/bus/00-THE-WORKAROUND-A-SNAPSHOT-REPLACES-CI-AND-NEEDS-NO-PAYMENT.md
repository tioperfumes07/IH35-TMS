# THE WORKAROUND — A SNAPSHOT MAKES THE PURGE UNDOABLE. CI IS THEN NOT REQUIRED. NO PAYMENT NEEDED.

Owner: *"I DON'T UNDERSTAND THE ISSUE. I HAVE PAYMENT ISSUES UNTIL MONDAY. SO FIND A WORKAROUND AND
SOLUTION."* And: 13515's expenses — **confirmed correct, that item is closed.**

## THE ISSUE, PLAINLY
GitHub Actions is the robot that re-runs every guard on every change, on its own machine, so nobody is
only taking the author's word. The billing lock turned it off, so today's merges rest on each seat running
the gates on their own laptop and reporting the result.

For normal code that is acceptable. **It mattered for the purge for exactly one reason: a permanent delete
has no undo.** That is the whole concern. Nothing else.

## THE SOLUTION — GIVE IT AN UNDO. THEN THE ROBOT IS NOT REQUIRED.
A Neon snapshot of production taken immediately before the first delete is a restore point. With one in
hand, the "permanent" delete stops being irreversible, and the reason CI was gating it disappears. This
needs **no GitHub, no CI and no payment.**

**AND A WARNING THAT MATTERS MORE THAN THE CI ONE:** the automatic backup schedule on the production
branch is **EMPTY** — `get_snapshot_schedule` returns no entries, and the newest snapshot is from
**2026-09-23**, ten days ago. **If the purge ran today, the nearest restore point would be ten days
stale.** That is the real exposure, it has nothing to do with the billing lock, and it has been true for
ten days without anyone noticing. Mine to have caught sooner.

I am not enabling a daily schedule on my own while the owner has a payment problem — snapshots consume
storage and that is his call, not mine. **One manual snapshot at purge time is what the purge needs**, and
that is cheap and specific.

## THE PURGE SAFETY PACKAGE — REPLACES CI, ITEM FOR ITEM
1. **Manual snapshot of production immediately before the first delete.** Named for the purge. This is
   the undo and it is the one non-negotiable item. Owner says go, I take it, I paste the id.
2. **Dry-run on a Neon branch off production first.** The purge script runs against a fork carrying real
   production data, and we read the result before prod is touched. **This is stronger than CI** — CI runs
   guard scripts, a fork runs the actual destructive script against the actual data.
3. **Two seats, two machines, independent gate runs.** The seat who wrote the purge does **not** verify
   it. A second seat runs the full suite in their own checkout and pastes the output. That is the
   independence CI provided, restored by hand.
4. **`--capture pre-delete`, then the purge, then `--compare`.** Unchanged, already the plan.
5. **The local gate exclusion comes out first.** CI being down is exactly why CC-1's uncommitted
   exclusion of 13515 cannot stay — with no robot, an exclusion nobody else can see is invisible. CC-3
   voids 13515's expenses through the executor, the exclusion is removed, and the gates pass on real data.

With 1–5 the purge proceeds this weekend. **CI is not on the critical path and the owner does not need to
clear the billing lock to start.** When it comes back Monday, the purge PR re-runs green and that is a
confirmation, not a gate.

## WHAT STILL HAS TO HAPPEN BEFORE THE FIRST DELETE — TWO ITEMS, BOTH SEATS', NEITHER THE OWNER'S
- **CC-1 — the 534 line rows the purge cannot see.** Still the one true blocker. Add the line's own
  account as a fallback company source in `trg_*_derive_company`, let the rows stamp themselves, then
  `SET NOT NULL`. Until this lands, the purge completes and leaves rows behind that no scoped query can
  find, and we would not know. Detail in `00-THE-534-ARE-DEADLOCKED-BY-THE-DERIVE-TRIGGER-EXACT-FIX.md`.
- **CC-3 — 13515's live expenses voided through the governed executor**, per item 5 above. The owner has
  confirmed the treatment is correct; it is now purely execution.

Everything else on the board — 1090 and 1295 refusing deposits and Relay spends, the empty tank
capacities, the overage engine being off — is **after** the purge, by design. Do not spend one hour on
rows that are about to be deleted.

## THE ONE THING I WILL NOT DO
Start a permanent delete with no snapshot. Not because of a policy, because there would be no way back.
Everything else about the billing lock has a workaround and it is above.
