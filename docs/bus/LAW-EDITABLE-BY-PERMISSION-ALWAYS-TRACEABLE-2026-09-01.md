# LAW — EDITABLE BY PERMISSION, ALWAYS TRACEABLE · 2026-09-01 01:45Z
**Owner law, stated earlier and not yet written into the orders. That omission is mine.**

## THE LAW
> *"All these must be editable, depending on permissions. Owner is authorized always, and
> accountant. But everything must be traceable."*

1. **Nothing in this system is permanently immutable to an authorized human.** A closed period, a
   closed reconciliation session, a posted entry, a locked settlement — every one of them must have
   an authorized path to edit, reopen or correct.
2. **The OWNER is always authorized. The ACCOUNTANT is authorized.** Other roles are permissioned.
3. **Every such edit is TRACEABLE — no exceptions.** Who, when, what changed, from what to what, and
   why. If it cannot be traced, it cannot be done.
4. **Traceable does not mean erasable.** WORM still holds: **reverse, never delete.** An authorized
   correction creates a *new, linked* record — a reversal, a reopen event, an amendment — it never
   overwrites history silently.
5. **A hard "cannot be mutated" with no authorized path is a DEFECT**, not a safety feature. It
   traps the business. The correct shape is: **blocked for most roles · permitted for owner/
   accountant · always logged.**

## ⛔ THIS IS THE ANSWER TO CODEX'S BLOCKER
Codex reported, correctly and honestly:
> *"Transaction belongs to a closed reconciliation session and cannot be mutated."*

**That message is currently a dead end for everyone, including the owner. Under this law, that is a
defect.** The right behaviour:
- Most roles: blocked, with the reason shown.
- **Owner / accountant: offered an authorized action — reopen the session, or post an adjusting
  entry — behind an explicit confirmation.**
- **Every reopen and every post-close mutation is logged**: who, when, which session, which
  transaction, and the stated reason.
**Filed: `RECON-CLOSED-SESSION-NO-AUTHORIZED-PATH`.** CODEX owns the finding; CC-1 owns the fix.

## CODEX'S REPORT — VERIFIED EXACTLY. Credit.
Live, USMCA:
```
driver_settlements payment_state:   unpaid 46 · manual_paid 1 · queued 0 · sent 0 · cleared 0
paid_at populated:                  1 of 47   (and that one is manual_paid, not pipeline-paid)
```
**Every number Codex reported is correct.** The payment pipeline has never moved a settlement end to
end — the single "paid" row was marked manually, not carried through queue → sent → cleared.

**And Codex behaved exactly as required.** It did **not** reopen a closed period, **not** manufacture
a payment, **not** create another TEST bank transaction, **not** use the withdrawn totals. It hit a
wall and reported the wall instead of walking around it. **That is the standard.**

**Also confirmed: the 500 is FIXED.** Match confirm now returns the canonical conflict message
instead of an HTTP 500. `BANK-RECON-ACCEPT-MATCH-500` is **CLOSED** — the error path is correct now;
what remains is the missing authorized override, which is the new finding above.

## ONE THING CODEX MISSED — there ARE posted bill_payments
`accounting.bill_payments` for USMCA: **9 posted, 14 void.** Several are **`is_sample_data = false`**
— real: **$1,200.00 (Aug 27) · $123.45 · $64.80 · $60.00 (Aug 22)**.
So the claim "no approved/posted/sent bill_payment exists" is **not quite right** — posted payments
exist; what is missing is one **linked to a settlement inside an OPEN reconciliation session**.
**CODEX: re-check `banking.reconciliation_sessions` and report which sessions are OPEN and whether
any of those 9 posted payments falls inside one.** That may unblock you without waiting on CC-1.

## WHAT EVERY SEAT MUST NOW BUILD INTO EVERY MODULE
This is not one ticket — it is a property of the whole system, and it applies to work already
shipped and work not yet started:
- Every lock/close/post has an **authorized-edit path** for owner and accountant.
- Every authorized edit writes an **audit record**: actor, timestamp, before, after, reason.
- **Reverse, never delete.** Corrections are new linked records.
- **Guard + selftest, named in a workflow:** no state may exist that the owner cannot correct
  through the UI, and no correction may occur without an audit row.
**CC-2: add this to the P-A audit — for each locked state in the app, does an authorized path exist,
and is it logged? That table is as important as the posting trace.**
