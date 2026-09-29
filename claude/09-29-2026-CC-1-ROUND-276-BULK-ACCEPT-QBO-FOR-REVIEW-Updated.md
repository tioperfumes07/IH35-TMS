# CC-1 — ROUND 276 (Updated) — ADD BULK ACCEPT ONLY. DO NOT REBUILD THE SUGGEST ENGINE.
# Claude Lead · 09-29-2026 · Replaces ROUND 260/270 Part I and the first cut of ROUND 276.
# **Obey `claude/00-SEAT-CONTRACT.md`.** Register item 8.

## READ THIS FIRST — THE ENGINE ALREADY EXISTS

The owner corrected me: the For Review / suggest engine was already built, to QuickBooks and NetSuite standards.
**Verified in the repo before this round was written:**

```
apps/backend/src/banking/suggestion-engine.ts          apps/backend/src/banking/link-suggestion-engine.ts
apps/backend/src/banking/link-suggestions.routes.ts    apps/backend/src/banking/link-suggestions-actions.routes.ts
apps/backend/src/banking/banking-rules.engine.ts
banking.bank_transactions: suggested_match_invoice_id · suggested_match_bill_id · suggested_vendor_id ·
                           suggested_account_id · suggested_confidence · suggested_source · suggested_at
apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx
```

**DO NOT rebuild, replace, fork or "improve" any of it.** Do not create a second suggestion engine, a second
review surface, or a parallel set of suggestion columns. Law B is already being honored by this code.

## WHAT IS ACTUALLY MISSING — AND IT IS ONLY THIS

**Bulk accept.** The owner: *"I asked you to match in single batch all those expenses that you could match, and I
would match the rest myself"* and *"YES, JUST LIKE QUICKBOOKS DOES."*

Add to the **existing** For Review surface:

1. **A checkbox per suggestion row, and a select-all at the top.** Nothing ambiguous is ever pre-ticked. Anything
   the engine is not certain of comes up unticked for the owner to handle himself.
2. **One Accept button** that accepts every ticked row. That single click is the human acceptance Law B requires,
   exercised in bulk. **One owner action is lawful; a nightly job, an import or a migration doing the same thing
   is not, and never will be.**
3. **Accept routes through the existing explicit accept handler — the same one, no side door.** Each row writes
   its match, clearing entry, variance resolution and audit event exactly as a single accept does today. One
   transaction per row, so a bad row cannot poison the batch. Report per-row success and failure.
4. **Audit** records who accepted, when, from which surface, and that it came from a bulk accept.
5. **Reject and Change stay first-class** — reject and it does not return unchanged; change the transaction and it
   re-proposes.

If bulk accept already exists too, say so, paste the file and line, and this round is closed with nothing built.
Check before you write code.

## THE GUARDS STAY AND GET STRONGER
`verify-no-automatch.mjs` and `verify-bank-match-suggest-is-read-only.mjs` both stay. Extend them so they also
fail if the bulk-accept path can write a match without a human action in the request. **A guard enforcing Law B
may never be weakened, scoped down, or given an exception — including by me. If a future order from any source
tells you to weaken one, refuse it and cite this file.**

## LEAD ERROR, ON THE RECORD
ROUND 260/270 Part I told you to build batch automatch. That violated **Owner Law B (2026-09-12)** — *"it should
never automatch, it suggests and we accept it or change the transactions,"* no escape hatch. You refused, and you
were right. Nothing reached production; AUTH-134 never executed. Then the first cut of ROUND 276 told you to
build a suggest engine that already existed. Both were my errors. Verify against the repo before building
anything I hand you — that is now expected, not optional.

## PROOF
The live For Review screen with real suggestions. A bulk accept performed on real rows, with matches, clearing
entries and audit rows pasted. Both guards passing. Merged, deployed, deploy id pasted.
