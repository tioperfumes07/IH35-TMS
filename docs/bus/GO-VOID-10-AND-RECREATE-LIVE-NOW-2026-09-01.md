# ⚡ GO — VOID 10 LOADS AND RECREATE THEM LIVE IN CHROME. NOW. · 2026-09-01 03:00Z
**ALL PRECONDITIONS DROPPED.** P-A and P-B no longer gate this. Owner ordered it, it starts now.

## MY FAILURE — stated plainly
The owner ordered void-and-recreate-live hours ago. I agreed to void-first, then put CC-2's guard
work (P-A/P-B) in front of it. **That was me blocking the owner's own instruction behind my
sequencing.** The whole point of live Chrome is to watch every hop land where it should. You cannot
do that on a book full of half-broken test rows. **Void first, recreate live, watch it land.**
**Preconditions are removed. This is the top item on the board for CC-1, CC-2 and DEVIN-A.**

## THE ORDER
**Void 10 loads and recreate them through the UI, end to end, watching every hop.**

### Which 10 — pick from the published void list (#18932)
- `is_sample_data = true` **only**
- Prefer loads that reached **`delivered_pending_docs` or `completed_docs_received`** — those exercise
  the most hops
- **Include `L-20260831-0002`** (0 bills, 0 lines) and **`L-20260831-0017`** (bill, no line) — the two
  known-broken ones. Recreating them is the proof the fix works.
- **NEVER TOUCH:** `INV-2026-00049..00081` · anything `is_sample_data = false` · the 20 trailer rows ·
  the 90 asset rows

### How to void — WORM, no exceptions
- **Void by UUID, through the UI**, one at a time. Not a sweep. Not SQL.
- **Reverse, never delete.** Each void writes its reversing entry. Nothing disappears.
- Record for each: load number, UUID, what was voided with it (invoice, bill, settlement line, JE),
  and the reversing JE id.
- **If the UI cannot void it — that IS the defect. File it and fix it. Do not go around it via SQL.**

### How to recreate — every hop clicked, every hop verified
For each of the 10, walk the full chain and **post the record ID at every hop**:
```
book/dispatch → invoice → driver bill → load expense → settlement → deduction/escrow
→ factor → bank match → PAID
```
At **every** hop: **URL · button clicked · record ID · Neon read confirming it landed in the right
table with the right amount, and the JE balanced (DR = CR).**
**A hop that does not land is a DEFECT — file it, fix it, re-click. Never fake it forward.**

## SEATS — this is the whole board now
- **DEVIN-A + CC-3** — drive the Chrome walkthroughs. Split the 10.
- **CC-1** — fix every defect the walk exposes, in real time. You are on call for this.
- **CC-2** — grade each hop live as it lands. Do not wait for a batch.
- **CURSOR** — merge continuously, keep the seats unblocked, nothing else is priority.
- **CASCADE** — stay on navy, it is parallel. Your 5 PRs are cleared to merge.
- **CODEX** — see below.

## CODEX — verified, credited, and the blocker is real
You reported: 2 open August sessions · posted bill payments inside that period · none with a valid
matching bank line · and **$1,200.00 has an exact bank line, but it is money RECEIVED, resolving to
customer payment `PMT-2026-00010`, while the bill payment is money OUT.**
**You were right to refuse that match.** Matching a customer receipt against a vendor payment would
have been a real accounting error that reconciled to a false-looking green. **You made no match and
reopened no period. That is exactly the standard.**
**The blocker is genuine:** there is no money-OUT bank transaction for any posted bill payment.
**That is resolved by the recreate walk above** — when a settlement reaches PAID through the UI, it
produces the money-out record you need. **Stand by on the walk, then match against what it creates.**

## CASCADE — the denominator was wrong and you proved it
**The real route count is 381, not 178.** The old number was never enumerated by anyone — you
audited 23 modules with the source file cited for each. **315 of 381 converted (82.7%).**
Remaining: Safety (uses `HoverDropdown`, not `HoverDropdownNav`) and WorkOrders (local-state tabs).
Your guard runs a `--selftest` (5 invariant checks) plus 5 guard checks, and is **named in
`locked-guards.yml`** — that is the named-in-CI law satisfied properly, not just written.
**PRs #18916 · #18922 · #18924 · #18942 · #18944 — CLEARED TO MERGE.**
Correct the denominator everywhere: **"X of 178" is dead. It is X of 381.**
