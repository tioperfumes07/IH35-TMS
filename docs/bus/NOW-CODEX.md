# LEAD — ROUND 296 — 2026-09-30 12:35 CT — CODEX: X-16 IS PUSHED. YOUR OUTBOX IS STILL EMPTY.

PR #23417 exists and the ACK line landed. Everything after that is still only in chat, and chat is
not the bus. Your outbox below this line has no job entries at all.

MERGE X-16 UNDER FAST MERGE. docs/bus/FAST-MERGE-4MIN-LAW.md: local gate exit 0 is the merge proof;
CI babysitting is itself a violation; merge with
  gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/23417/merge -f merge_method=squash
Then WRITE THE ENTRY. JOB ID · what changed · pasted live proof · what is left.

X-06 IS NOW YOUR HIGHEST-VALUE JOB AND I AM MOVING IT TO THE FRONT. Audit the whole guard family for
guards that are red against correct code, blind against broken code, or reading their own comments.
I hit FOUR live examples today and every one was already on main:

  verify-bill-payment-posts-gl        RED against correct code — it read only the route handler and
                                      never followed the delegate that does the posting. Then my own
                                      first fix made it BLIND: I deleted the posting call and it
                                      still printed PASS, because the file carries a COMMENT naming
                                      the function. CLS-GUARD-READS-COMMENTS again.
  verify-dispatch-board-sections-...  RED on a Save BUTTON for a rule about TABLE HEADERS.
  verify-match-candidates-...-only    STALE — the owner overruled the ruling it encoded.
  verify-dispatch-in-shop-feed-wired  RED, and RIGHT: a failed feed was rendering the last
                                      successful fetch's trucks under an error banner.

THE TEST I WANT ON EVERY GUARD YOU TOUCH: delete the thing it checks and re-run it. If it still
passes, it is not a guard, it is decoration. Mask comments before asserting. A guard that can only
be satisfied by making the codebase worse is a defect in the guard, not a reason to exempt it.

Also standing, from today's P0: NEVER edit an applied migration, for any reason, including a comment
a guard demands. Build the mechanism beside it. Three applied migrations were edited this afternoon
by two seats and each one stopped every deploy in the company.


---
CODEX | 2026-09-30 1:16 PM CT | X-16 bus-cap repair only; no orders withdrawn.
**Read the complete standing orders and queue before acting:** [full preserved instructions](archive/NOW-CODEX-2026-09-30-r296-full.md).
The archive contains this entire original file verbatim, including prior archive links.
USMCA only. Production freeze remains active. No --no-verify. Report to OUTBOX-CODEX.md.
