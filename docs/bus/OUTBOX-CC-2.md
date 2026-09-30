# OUTBOX — CC-2 — restarted 2026-09-30T11:27Z
# One entry per job id: JOB ID · what I changed · pasted live proof · what is left.
# Append below. Do not delete another seat's entries.


## B-01 — $17,057.44 double-booked factoring — DONE

Reversed all 4 orphans (FAC-2026-00048/63/64/82) via `postVoidReversal` (AUTH-165, CONSUMED).
TB delta exactly $17,057.44: account 1090 $17,867.98 -> $16,162.34. Reversal-JE register:
FAC-2026-00048 -> 5a196036-c613-485f-9733-0d8e6f5aa3bb
FAC-2026-00063 -> ccf1ed7f-c31f-4f7c-b72b-0e8e38fc0b57
FAC-2026-00064 -> fc874797-9b54-4a83-b058-065431e89999
FAC-2026-00082 -> c05a0e93-e81a-44fe-8e37-1214e38f54dc
Double-book guard confirmed live: `assertNoLiveFactoringTwin` (CC-1, PR #23320), enforced by
`verify-universal-reinstate-engine.mjs` -- PASS.
Found while proving this: `executeVoidCancel("factoring_advance")` never reversed the GL at all
(header-only, false comment). Fixed same session (PR #23353), mirrors `executeFuelTransaction`'s
pattern, live-tested against FAC-2026-00140. `verify-no-voided-doc-has-live-postings.mjs` also
never scanned `factoring_advance` -- fixed in the same PR.
Nothing left on B-01.

## R-02 step 1 — reinstate fails closed when it cannot restore GL — DONE

PR #23362, merged (squash 9388229f5). `reinstateDocument()` now refuses, for every one of its
~10 document families, when the original void reversed GL postings and the caller has not
promised (`expectGlRestoreFollowUp:true`) to restore them in the same call chain. New
`ReinstateGlNotRestoredError`. Only `reinstateDocumentThenVoidReversal` sets the flag -- confirmed
via full-repo grep it is the ONLY caller of bare `reinstateDocument` anywhere outside the file and
its own tests, so this closes the hole with zero behavior change on the 6 already-wired
`/unvoid` routes (bill/bill_payment/expense/invoice/customer_payment/credit_memo/prepaid_purchase).
LIVE PROOF: calling bare `reinstateDocument` on a real live factoring_advance (FAC-2026-00140,
real reversing JE present) now throws `ReinstateGlNotRestoredError` instead of silently leaving
the header "advanced" while the GL stayed reversed -- confirmed this was the actual prior
behavior before the fix. `apps/backend && npx tsc -p tsconfig.json --noEmit` exit 0;
`npx vitest run src/accounting/__tests__/reinstate-document.test.ts` -- 4/6 passed (was 3/6 on
the unmodified baseline, confirmed via git stash + re-run; the 2 remaining failures are
pre-existing, unrelated, named not touched).

WHILE PROVING THIS, found a separate, deeper, pre-existing defect -- filed to
`docs/audit/GUARD-WORKORDERS.md` as `REINSTATE-VOIDJE-REVERSAL-SEVERS-SOURCE-LINKAGE`, NOT fixed:
`reinstateDocumentThenVoidReversal`'s GL-restore mechanism (`voidJournalEntry` on the reversing JE,
Option-1) correctly restores the ECONOMICS -- live-verified on a real round trip against
FAC-2026-00140: the restorative (third) JE carries the exact same accounts/amounts/sides as the
original. But it does NOT preserve `source_transaction_type`/`source_transaction_id` linkage back
to the source document -- the third JE's postings carry `source_transaction_type='journal_entry'`
pointing at the reversal JE, not `'factoring_advance'` pointing at the document. Any standard
"find live postings for document X" query (the same predicate `verify-no-voided-doc-has-live-
postings.mjs`, `postVoidReversal`'s `readOriginalGlPostings`, and multiple other guards this
session all use) returns zero for a reinstated-then-still-live document, even though the money is
real and correct -- untraceable by the normal path, only by walking `reverses_je_id` backward.
Independently corroborated via a real pre-existing production case (expense
9b5fcc6c-6d8c-4e14-83ab-49c79c9132e9, AUTH-117/118's own 2026-09-28 proof, same shape, deliberately
re-voided afterward by CC-1 as a clean test).
CONTRAST, bears directly on Step 2's design: CC-1's own A-10 proof today
(`docs/bus/2026-09-30-CC1-A10-REINSTATE-EXACT-POSTINGS-ROUNDTRIP-PROOF.md`) shows AUTH-144's
factoring reinstate, via `postFactoringAdvanceEventInClientTx` (a genuinely fresh re-post through
the SAME sanctioned poster, not the generic reversal-of-reversal path), produces a byte-for-byte
identical NEW JE that stays correctly linked -- because it's a real fresh transaction, not a
reversal of a reversal. Suggests Step 2 (family-by-family re-posting, factoring first, per your
ruling) should follow AUTH-144/A-10's proven pattern rather than extend the generic
`voidJournalEntry`-based engine -- filed for your ruling, not decided here.

FAC-2026-00140 (my test record) was left in a genuinely-restored state: status='advanced', money
correctly live via the third JE, consistent with how it started (advanced/live) -- not re-voided,
since re-voiding would be a new deviation rather than a restoration.

Left on R-02: Step 2 (family-by-family re-posting with round-trip proof, factoring first) --
awaiting your ruling on which pattern to follow (family-specific re-post vs. fix the generic
engine's linkage), per the REINSTATE-VOIDJE-REVERSAL-SEVERS-SOURCE-LINKAGE finding above.

Moving to B-03 next (19 invoices, zero lines, $82,175).

— CC-2
