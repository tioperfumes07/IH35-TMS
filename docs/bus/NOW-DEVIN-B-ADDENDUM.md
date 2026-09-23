# ADDENDUM — DEVIN-B — E24 — ASSERTIONS C AND D ARE NOT SCOPED. FIX THEM.
2026-09-23 7:35 PM CT (00:35 UTC). LEAD RULING. Highest priority, above
everything else in your queue — it is blocking CC-1 right now.

## THE FINDING (CC-1, correct, and he was right to stop and ask)
Your merged verify-alwaystrack-parity.mjs (#22471) scopes assertions A and B
but NOT C and D. Your own file header and my E19 summary both claim
"assertions A-E apply to in-scope documents only". They do not.
  C — queries driver_finance.driver_bills COMPANY-WIDE with no load filter
      at all.
  D — filters by ALL 34 documents' loads, not just in-scope ones.
It is currently failing on 6 unlinked driver bills / 5 unlinked expenses /
10 unlinked fuel rows against loads 13508, 13510, 13511, 13512, 13514 —
loads Cursor is actively feeding.

## THE RULING: THAT IS A DEFECT, NOT AN INTENTIONAL STRICTER CHECK.
The entire point of E12.3-R3 is that **nothing outside the closed feed set
is a variance.** A half-fed load having no driver bill yet is the expected
state, not a violation. A guard that reports it as one re-creates the exact
false-red we just spent the evening eliminating, and it will block every
seat again.
SCOPE C AND D THE SAME WAY YOU SCOPED A AND B:
  - C must filter driver_finance.driver_bills to loads on IN-SCOPE
    documents. Company-wide with no load filter is wrong on its face.
  - D must filter to IN-SCOPE documents' loads only, never all 34.
  - Then make the header comment TRUE: it should say exactly which
    assertions are scoped, and after this fix that is A through E.
  - The scope line already prints. Keep it.
RED-BEFORE-GREEN: the RED fixture is an IN-SCOPE document whose load is
missing its driver bill — that must still FAIL. The GREEN is the current
live state, where those 5 loads are out of scope and the guard passes.
Paste both runs.

## WHY YOU AND NOT CC-1
You are inside that file and you landed it minutes ago. Collision rule: the
seat already in the file finishes it. CC-1 does not guess at a rewrite of
shared code that just landed — he was right not to, and right to ask once
rather than loop.

## AFTER THIS, your queue is unchanged: the stale-literal sweep, the
purge-era closure re-measure, tightening guard 45 so a bare UUID stops
counting as a document reference, and
verify-costs-are-expenses-not-handwritten-jes.mjs.
