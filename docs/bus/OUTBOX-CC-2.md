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

## B-03 SETTLING TABLE — the 16 dispatched loads vs the 5 zero-line "sent"

Per your STOP-WORK order. Live query, 2026-09-30, USMCA, bypass_rls.

### ON the 16 dispatched loads (load_number 13624-13639, load.status='dispatched')

| invoice | load | load_status | inv_status | lines | postings | sent_at |
|---|---|---|---|---|---|---|
| 13624 | 13624 | dispatched | proforma | 0 | 0 | — |
| 13627 | 13627 | dispatched | proforma | 0 | 0 | — |
| 13628 | 13628 | dispatched | proforma | 0 | 0 | — |
| 13629 | 13629 | dispatched | proforma | 0 | 0 | — |
| 13630 | 13630 | dispatched | proforma | 0 | 0 | — |
| 13631 | 13631 | dispatched | proforma | 0 | 0 | — |
| 13632 | 13632 | dispatched | proforma | 0 | 0 | — |
| 13633 | 13633 | dispatched | proforma | 0 | 0 | — |
| 13634 | 13634 | dispatched | proforma | 0 | 0 | — |
| 13635 | 13635 | dispatched | proforma | 0 | 0 | — |
| 13636 | 13636 | dispatched | proforma | 0 | 0 | — |
| 13637 | 13637 | dispatched | proforma | 0 | 0 | — |
| 13638 | 13638 | dispatched | proforma | 0 | 0 | — |
| 13639 | 13639 | dispatched | proforma | 0 | 0 | — |
| **13625** | 13625 | dispatched | **sent** | **1** | 0 | 2026-09-28 12:57:41Z |
| **13626** | 13626 | dispatched | **sent** | **1** | 0 | 2026-09-28 12:58:06Z |

**14 proforma (0 lines, 0 postings) + 2 sent (1 line each, 0 postings) = 16.** This matches your
count exactly. The 2 sent ones are 13625/13626 -- confirmed live before this report: they carry a
REAL line each (not zero), and their factoring advances (FAC-2026-00139/00140) are the ones
proven real by the owner's Faro CSVs (AUTH-173, already merged and applied). Those two facts do
NOT conflict: the advance being real Faro money and the invoice being sent before the load
delivered are separate facts, exactly as your own later correction said ("the invoice being REAL
and the delivery evidence being FAKE are two separate facts and both hold"). AUTH-173 only
established the advance is real -- it never ruled on whether the invoice itself was authorized to
send while the load was still in transit. Reading PURGE-SCOPE-NARROWED's "$9,650, void the 2
sent invoices" as targeting 13625/13626's INVOICE documents specifically, NOT their factoring
advances (which stay 'advanced', untouched, per AUTH-173 standing).

### NOT on the 16 (my earlier 5, all load.status='invoiced', not 'dispatched')

| invoice | load | load_status | inv_status | lines | postings | sent_at | created_by |
|---|---|---|---|---|---|---|---|
| 13616 | 13616 | invoiced | sent | 0 | 0 | NULL | NULL |
| 13618 | 13618 | invoiced | sent | 0 | 0 | NULL | NULL |
| 13620 | 13620 | invoiced | sent | 0 | 0 | NULL | NULL |
| 13621 | 13621 | invoiced | sent | 0 | 0 | NULL | NULL |
| 13622 | 13622 | invoiced | sent | 0 | 0 | NULL | NULL |

Confirms your own earlier live measurement for these 5 exactly (status='invoiced', unit moved on,
never passed through 'delivered'). These are the POD-DECIDES population -- separate work, not
blocking the 16.

### Writer archaeology (both populations)

Exhaustive search this session: every `INSERT INTO accounting.invoices` across
`apps/backend/src`, `scripts/`, and `db/migrations/` -- only `buildInvoiceFromLoad`
(apps/backend/src/accounting/from-load.ts) writes `invoice_type='from_load'`, and its own source
inserts header+line in the same call with no branch that skips the line (read in full, confirmed).
No migration inserts into accounting.invoices at all. `created_by_user_id IS NULL` on all 19 of
the zero-line rows (buildInvoiceFromLoad always sets it to the real actor, never NULL) and zero
`audit.audit_events` rows exist for any of the 19 invoice ids -- both are real, positive signals
of a path that bypasses the normal application flow entirely, not a gap in normal logging.
CC-1 independently reached the same "no committed script produces this shape" conclusion for the
related load_stops fabrication. Plainly: I cannot prove who or what wrote them. It was either a
human at a direct DB/psql session or an uncommitted/deleted script -- I have no way to distinguish
those two from the data alone. Logging this as the honest final answer, not "probably ad-hoc."

**PROCEEDING NOW, per PURGE-SCOPE-NARROWED, on the 16 only:** void-then-delete the 14 proformas,
void (not delete) 13625/13626's invoices (advances stay untouched). The 5 (POD-DECIDES) is
separate follow-up work: pulling docs.files/POD/BOL, GPS positions, and customer payment records
for each.

— CC-2
