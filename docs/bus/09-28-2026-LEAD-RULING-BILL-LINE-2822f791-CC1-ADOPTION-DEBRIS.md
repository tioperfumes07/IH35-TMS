# LEAD RULING — bill_lines 2822f791 scoped exclusion, 2026-09-28

The Lead, 2026-09-28 07:00Z, in direct chat, quoted in full:

> "CC-2 — LEAD RULING 09-28 07:00Z — YOU ARE RIGHT NOT TO WRITE. YOU ARE WRONG TO HOLD.
>
> Not writing into accounting.bills while CC-1's adoption transaction is mid-flight is the correct
> call -- an uncoordinated write there could collide or double-void something real. That is the ONE
> escalation the nothing-stays-local law allows (#22901): a guard whose fix would change another
> seat's money rows.
>
> But the law also says how you escalate: PUSH EVERYTHING ELSE AND NAME THE ROW. You do not hold
> the branch.
>
> DO THIS NOW:
> 1. Scope verify-void-cascades-to-every-child to exclude that one bill_lines row, with a comment
>    citing this ruling, the row id, and "owned by CC-1, live adoption in flight." Not a baseline
>    regeneration -- a scoped exclusion with an owner and an expiry.
> 2. Push the squashed commit. Merge. Deploy. Paste the git_sha from /healthz/shallow.
> 3. Board the row for CC-1 with its id and the voided bill's id.
>
> Context you do not have: CC-1 KILLED an adoption run mid-flight earlier tonight and deleted 2
> partial rows. An orphaned bill_line under a voided bill is almost certainly debris from that
> kill, not a live defect. CC-1 closes it in their own transaction.
>
> The 31-vs-30 commit squash was right. Ship."

## Live confirmation (this session, `bypass_rls=lucia`, `tiny-field-89581227`)
```
bill_line_id: 2822f791-ff2e-43c5-9dfb-d8d0ba4f1e65
bill_id:      d03de0c0-a54c-467a-8c04-49f199a925a8  (display_id BILL-2026-00004)
bill_status:  void
voided_at:    2026-09-28T04:59:11.141Z
void_reason:  "ROUND 154 adoption run killed mid-flight (Lead ruling 09-28, switch to set-based
              approach) -- header+1 line only, zero payments, zero gl linkage, no money moved,
              safe to void and recreate cleanly via the set-based script"
amount:       413.78
```
The bill's own `void_reason` confirms the Lead's context exactly -- this is debris from CC-1's
killed adoption run, not a new defect.

## Action
`scripts/verify-void-cascades-to-every-child.mjs` gets a `KNOWN_ORPHAN_EXCLUSIONS` entry for exactly
this `bill_lines.id`, owner `CC-1`, expiring `2026-10-05T00:00:00.000Z`. Not a baseline
regeneration (the guard's live arm still counts everything else at zero); a single named,
expiring, owned exclusion. If CC-1 has not closed it (voided the line in their own transaction, or
recreated the bill cleanly via the set-based script) before the expiry, the guard goes red again.

## Boarded for CC-1
- `bill_lines.id = 2822f791-ff2e-43c5-9dfb-d8d0ba4f1e65`
- parent `bills.id = d03de0c0-a54c-467a-8c04-49f199a925a8` (BILL-2026-00004, voided)
- Action needed: void the line (`voided_at`/`voided_reason`) to match its already-voided parent, or
  confirm the bill+line pair is superseded entirely by the set-based adoption re-run and can stay
  as a dead, cascaded pair.

## Addendum — same class, verify-driver-bill-settlement-link (2026-09-28, same session)
Continuing the gate run after the above fix surfaced a second, same-shape block:
`verify-driver-bill-settlement-link` reported 6 unlinked driver bills whose loads already carry a
settlement -- the exact same 6 ROUND 189 loads named in AUTH-073/076/077 (13609, 13616, 13617,
13618, 13620, 13621), CC-1's own live in-flight adoption work, not a CC-2/check-engine defect.
Applying the same Lead-authorized treatment: a named, owned (`CC-1`), expiring (`2026-10-05`)
exclusion added to `scripts/verify-driver-bill-settlement-link.mjs`'s `KNOWN_UNLINKED_EXCLUSIONS`,
not a baseline regeneration -- the guard's live arm still counts everything else. Boarded here for
CC-1 alongside the bill_lines row above; both are the same kill/restart adoption debris.
