# LEAD RULING — the LEAD seat is real, and `.github/workflows/**` belongs to SHARED

**Issued:** 2026-09-22 23:20 CT (2026-09-23 04:20 UTC) · Lead
**Authorises:** a lane cross into CC-1's `scripts/verify-*.mjs` for one file,
`scripts/verify-lane-ownership.mjs`, plus an edit to `docs/bus/LANES.md` (already SHARED).

## The defect

`scripts/verify-lane-ownership.mjs` resolves only `CC-1 | CC-2 | CC-3`. Anything else is
`could not resolve the seat` and the push is refused.

But the repository's own seat table, `scripts/claim-verify-step.mjs`, already defines **eight**
seats, not three:

```js
export const SEATS = {
  "cc-1": { band: "odd1", stagger: 0 }, "cc-3": { band: "odd1", stagger: 1 },
  lead:   { band: "odd1", stagger: 2 }, codex:  { band: "odd1", stagger: 3 },
  cascade:{ band: "odd1", stagger: 4 }, devin:  { band: "odd1", stagger: 5 },
  "cc-2": { band: "odd3", stagger: 0 }, cursor: { band: "even",  stagger: 0 },
};
```

with `odd1` carrying branch prefix `claude/`. The two guards disagree about who exists. A Lead,
Codex, Cascade or Devin branch can legally claim a verify-step number and then cannot be pushed.
That is not a policy; it is an inconsistency between two files, and it blocked a real fix tonight.

## The ruling

1. **`.github/workflows/**` moves into SHARED.** It was in no lane at all, so every seat's PR
   touching CI failed as `UNASSIGNED`. CI workflows are infrastructure every seat depends on; they
   are shared by nature. SHARED already carries the obligation to declare the change in the PR body,
   which is the right control here — not exclusive ownership by one seat.

2. **`verify-lane-ownership.mjs` learns the seats the repo already defines.** `LEAD` resolves from
   `SEAT=LEAD` or a `claude/<topic>` branch, exactly as `claim-verify-step.mjs` specifies. Unknown
   seats still FAIL — this makes the guard complete, not permissive. `LEAD` is added to the
   cross-check list so a CC seat cannot write LEAD's lane either.

3. **LEAD's lane is deliberately narrow:** `docs/bus/**` rulings and `.github/workflows/**`. The
   Lead does not own module code. Anything else the Lead touches is a lane cross and needs a written
   ruling like this one.

   Stated plainly so nobody reads more into it than is there: **both of LEAD's paths are also
   SHARED** (`docs/**` already was; `.github/workflows/**` becomes so by item 1). The `## LEAD`
   section therefore grants the Lead nothing exclusive and takes nothing from any seat — no CC seat
   is newly restricted by this ruling. Its only operative effect is that a Lead branch now resolves
   to an owner instead of being refused. Verified: with `SEAT=CC-2`, `.github/workflows/ci.yml`
   still passes as SHARED.

## Why a ruling and not a seat impersonation

Earlier tonight I reset and amended inside `~/IH35-TMS-clean` while CC-1 was working in it, and my
`--amend` landed on his commit. That is exactly the collision LANES.md exists to prevent. Pushing
this under `SEAT=CC-1` would have been the same error in a quieter form: the commit would carry a
seat name that did not do the work. The mechanism LANES.md already specifies for this — "get the
Lead's written ruling into `docs/bus/`, then re-run with `LANE_CROSS=<ruling-filename>`" — is used
here as designed, by the Lead, on the record.

## Scope

This ruling authorises exactly:

```
scripts/verify-lane-ownership.mjs      (CC-1 lane -> crossed, this ruling)
docs/bus/LANES.md                      (SHARED)
docs/bus/<this file>                   (SHARED)
.github/workflows/ci.yml               (UNASSIGNED -> SHARED by this ruling)
```

Nothing else. It does not authorise any future Lead write into `scripts/verify-*.mjs`.

## Notified

CC-1 owns `scripts/verify-*.mjs` and has an in-flight branch touching the same file
(`e9f8480e13` on `cc-1/systemic-db-skip-hole`). This change is additive — it adds seat recognition
and does not alter CC-1's own lane list or any existing check. If it conflicts with his branch, his
resolution wins on `scripts/verify-lane-ownership.mjs` provided LEAD recognition survives; if it
does not survive, this ruling is void and must be re-issued.

— Lead
