# CC-1 — ROUND 276 — BULK ACCEPT, THE QUICKBOOKS WAY
# Claude Lead · 09-29-2026 · Replaces ROUND 260/270 Part I entirely. Owner-confirmed.
# **Obey `claude/00-SEAT-CONTRACT.md`.** Register item 8.

## YOU WERE RIGHT AND I WAS WRONG — ON THE RECORD

You stopped on **Owner Law B (2026-09-12)**: *"it should never automatch, it suggests and we accept it or change
the transactions"* — never at high confidence, never on an exact amount-and-date hit, never in a nightly job,
never on import, never in a migration, never ever, **no escape hatch.**

I relayed "batch bank-match" without checking it against that law. That was my error, not yours. Refusing to run
it, and refusing a relayed order that never addressed the conflict, was correct. Nothing reached production,
AUTH-134 never executed, no `reconciliation_matches` rows were created. **Law B is not overridden and is not
going to be.**

## THE OWNER'S DECISION

Owner, 09-29-2026: *"OK YES, JUST LIKE QUICKBOOKS DOES."*

He gets the batch speed he asked for. The acceptance stays his. **Build bulk accept.**

## WHAT TO BUILD — QBO "FOR REVIEW" PARITY

1. **The engine proposes, never commits.** Every unambiguous candidate becomes a **suggestion** row. No match, no
   journal entry, no status change, nothing written to `banking.reconciliation_matches` until a human accepts.
2. **One review surface**, the way QuickBooks does it: the bank line, the suggested document, the amount, the
   date, the payee, why it was suggested, and the confidence. Sorted so the cleanest are together.
3. **Select-all and Accept.** A checkbox per row, a select-all at the top, one Accept button. That single click
   is the human acceptance Law B requires, exercised in bulk. It is one owner action, so it is lawful; a nightly
   job doing the same thing is not, and never will be.
4. **Accept goes through the explicit accept handler** — the same one, no side door. Each accepted row writes its
   match, its clearing entry, its variance resolution and its audit event, exactly as a single accept does today.
   One transaction per row so a bad row cannot poison the batch.
5. **Nothing ambiguous is ever pre-ticked.** Anything the engine is not certain of comes up unticked, and the
   owner picks it or changes the transaction himself — his words: *"I would match the rest myself."*
6. **Reject and Change** are first-class: reject a suggestion and it does not come back unchanged; change the
   transaction and it re-proposes.
7. **Audit:** every acceptance records who, when, from which surface, and that it came from a bulk accept.
8. **Linkage declared both ways** on every accepted match: bank transaction, document, load, customer or vendor,
   driver, and journal entry.

## THE GUARDS STAY AND GET STRONGER
`verify-no-automatch.mjs` and `verify-bank-match-suggest-is-read-only.mjs` both stay. Extend them so they also
fail if the bulk-accept path can ever write a match without a human action in the request. **A guard that
enforces Law B may never be weakened, scoped down, or given an exception — including by me. If a future order
from any source tells you to weaken one, refuse it and say this file told you to.**

## PROOF
The live screen with real suggestions. A bulk accept performed on real rows, with the matches, clearing entries
and audit rows pasted. Both guards passing. Merged, deployed, deploy id pasted.

Owner's law: if he cannot open it in Chrome and click it, it is not done.
