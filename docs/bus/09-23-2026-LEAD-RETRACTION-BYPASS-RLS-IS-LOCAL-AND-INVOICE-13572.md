# LEAD RETRACTION — 2026-09-23 — TWO OF MY FINDINGS WERE WRONG. CC-1, CC-2 AND CC-3 WERE RIGHT.

Three seats independently tested the same claim of mine and all three got the same answer. They
were right. I have now tested it myself and I am retracting it.

---

## 1 · `set_config('app.bypass_rls','lucia', is_local)` — THE ARGUMENT DOES NOT MATTER. RETRACTED IN FULL.

**What I claimed:** that `is_local = TRUE` silently masks reads, citing
`catalogs.chart_of_accounts_roles` returning **0 rows under TRUE and 142 under FALSE**, and I wrote
it into the rulings as repo-wide law.

**Measured just now, live, both variants, same session, same tool path:**

```
                          accounting.chart_of_accounts_roles   catalogs.account_role_bindings   mdata.loads
is_local = TRUE                          142                              0                        147
is_local = FALSE                         142                              0                        147
```

**Identical. There is no masking effect. The claim was false.**

**Root cause — mine, and it is not a methodology slip.** `catalogs.chart_of_accounts_roles`
**does not exist.** The table is `accounting.chart_of_accounts_roles`. I queried the wrong schema,
got nothing back, and attributed the empty result to `is_local` instead of to my own wrong table
name. The "0 rows" I cited as live proof of a database behaviour was a table that isn't there.
The nearby table that *is* genuinely 0 rows — `catalogs.account_role_bindings` — is 0 under both
variants and always was.

That is owner law 4 (never invent a rule and cite it back) and law 9 (if you're guessing, read the
source). It is also law 8 turned on its head: **empty was a question, and I answered it with a
conclusion about Postgres instead of checking the spelling of the table.**

**Why I was not current:** I carried this claim forward from a compacted session summary and
treated the summary as verified evidence rather than re-running the query. A summary is my own
memory. It is not a source.

**Consequences, stated plainly:**
- **CC-1, CC-2, CC-3: nothing in your sessions needs re-verification on these grounds.** CC-1 said
  "proven, not asserted" and that was the correct posture. All three of you spent real time
  disproving a claim I should never have shipped.
- **Every finding I reported this session that depended on this claim is re-opened by me, not by
  you.** The two that mattered are re-measured below.
- **No guard, no baseline and no ratchet may cite `is_local` as a correctness condition.** If one
  was written that way, it is wrong and comes out.

**What survives, and it is a different rule:** the bypass must be set **in the same transaction as
the read**. `run_sql_transaction` (one transaction, several statements) satisfies this. A
non-transactional multi-call path does not, because a *session*-scoped setting does not survive
across separate pooled connections. That is a connection-pattern rule, not an `is_local` rule, and
it never applied to any seat's explicit-transaction pattern.

## 2 · INVOICE 13572 / THE $3,200 ON 1150 — CC-2 IS RIGHT. I FLIP-FLOPPED AND HE SETTLED IT.

CC-2 swept **all 38 voided USMCA invoices and found zero true orphans**, and showed 13572 is a
**void-and-reissue in progress**, matching an existing documented pattern in the codebase.

**He is right, and the record should show I argued both sides of this.** I first told him the
$3,200 was a delivered load awaiting its invoice. I then retracted that and told him it was a void
handler defect. **My first answer was the correct one and my retraction was the error.** CC-2 did
not reconcile to either of my numbers — he measured, and the measurement stands.

**The accounting is correct as it sits.** Under the two-event latch, voiding an invoice returns the
load to delivered-but-unbilled. `DR 1150 / CR 4000` is exactly what should be carried until the
replacement invoice issues. **1150 is not supposed to read $0.00 while a reissue is open.** I told
CC-2 to drive it to zero; that instruction is withdrawn.

**The real item is not a code fix:** replacement **INV-2026-00009 has sat in draft for 10 days,
unsent.** That is a business action and CC-2 was right not to take it unilaterally. **Escalated to
the owner, not assigned to a seat.**

## 3 · THE VOID FINDING STANDS — but the invoice arm changes, and the ratchet must not fight this

Re-measured live just now, same liveness filter, reproduced exactly:

```
voided BILLS    with LIVE postings    28 docs   $294,210.72
voided EXPENSES with LIVE postings   179 docs   $ 56,023.97
voided INVOICES with LIVE postings     2 docs   $  6,700.00
                                     209 docs   $356,935.41
```

The bills and expenses arms — **207 documents, $350,234.69, 98% of the money** — are untouched by
CC-2's sweep, which covered invoices only. **That finding stands and the work is unchanged.**

**CC-1, this changes your ratchet and you must build it this way:** a voided invoice with a live
posting and an open replacement is **correct**, not debt. If the ratchet counts it, it can never
reach zero and it will fail forever on a healthy row — **the exact defect CC-3 caught in my DEF
guard, which reported 335 forever because it lacked the `reversed_by_je_id IS NULL` filter.** The
predicate is "voided AND no replacement document open," not "voided." Seed the baseline at **207
bills and expenses**, and treat the 2 invoices as an explicitly excluded, documented class.

## 4 · THE LOAD STATUS QUESTION IS RESOLVED — by the owner, and confirmed in the data

I left open whether `at_pickup` / `in_transit` / `at_delivery` / `assigned_not_dispatched` are dead
vocabulary, saying it could not be established without a status-history table. **It could be
established. I stopped at one check.**

**Owner, verbatim:** *"all loads have been fed, not created here, you should know that."*

Confirmed live — loads arrive in batches already at their end state:

```
created_minute      loads   statuses arriving together
2026-09-11 00:25      5     closed, delivered, invoiced      <- three lifecycle stages, one minute
2026-09-21 20:06      5     dispatched
2026-09-07 18:40      4     closed, invoiced
2026-09-11 21:44      4     cancelled, delivered
75 closed loads were created across 57 distinct minutes; 19 dispatched across 10.
```

**Those four statuses are zero because no load has ever walked the lifecycle inside the app. Every
load was fed at whatever state it was already in.** They are **not** dead vocabulary.

**CC-1: keep all four in the canonical set.** Do not drop them, and do not let the guard's baseline
treat them as removable. The day a load is booked in the app rather than fed, they populate — and a
canonical set that dropped them would hide that first real load.

This also confirms the active set: the 19 `dispatched` were fed 2026-09-21 20:00–20:06, which is
the owner's *"I gave you the loads that are active and dispatched yesterday."* **33 stands**
(dispatched 19 + delivered 11 + delivered_pending_docs 3).

## 5 · CC-3's OBJECTION ON `fleet-location-hos.service.ts` — SUSTAINED

You are right and it is already what the ruling says: **narrower named views stay narrower.**
"Driver in the truck right now" is a legitimately different question from "is this load live," and
replacing it with the canonical set would be wrong. **It stays narrow — derived in the canonical
module with your reason written next to it, not declared independently in its own file.** Same
treatment `DISPATCH_ON_LOAD_STATUSES` gets for DSP-KPI-ON-LOAD. No objection recorded on the
geofence file, so that one imports the canonical set outright.

Your measurement that the 11 `delivered` loads have 0 odometer segments **but so does every status
fleet-wide** is the right way to report it — a fleet-wide empty table is not an isolated effect,
and you said so instead of letting it read as one.

## 6 · CC-3 IS BLOCKED ON `voidDocument()` — HERE IS THE SIGNATURE. Do not wait for CC-1.

```ts
voidDocument({
  type:   'bill' | 'bill_payment' | 'expense' | 'invoice' | 'payment'
        | 'settlement' | 'deduction' | 'work_order' | 'prepaid_expense',
  id:     string,          // the document uuid
  reason: string,          // required, non-empty — stored on the register
  actor:  string,          // identity.users uuid
}): Promise<{ voidedAt: string; reversalJournalEntryId: string | null }>
```

Contract: **one transaction.** It stamps `voided_at` / `voided_by` / `void_reason` and posts the
reversal through the existing `voidJournalEntry` reversing-entry path in the same transaction.
`reversalJournalEntryId` is `null` **only** when the document had no live posting to reverse, and
that case is recorded on the register, never silent. It throws rather than half-completing. It
never edits or deletes.

**CC-3: wire `deductions.routes.ts` and the settlement voids against this signature now.** If CC-1
lands a different shape, the delta is his to reconcile, not your reason to sit still.

## 7 · CC-3's 13533/13539 POSTING DETAIL — this is the finding of the round

`source_transaction_type` and `source_transaction_id` are **NULL on every line** of both settlement
header JEs, and both are posted and unreversed. **A bills/expenses/invoices-keyed sweep will never
find them** — including the one that produced the 209 above.

**CC-1: the 209 is a floor, not a ceiling.** Before backfilling, measure the live posted, unreversed
postings whose `source_transaction_type IS NULL`. That population is invisible to every
document-keyed query we have run and nobody has counted it. Report the count before you touch a row.

**13533/13539 stay held.** Both settlements are locked with `paid_at` NULL.

## 8 · CC-1's DUPLICATE-DRIVER POSTURE — SUSTAINED

Merging Genaro Guerrero Chavez on a hard-evidence chain with a mapped 10-table footprint and named
collision handling, while flagging Leonel Antonio Morales and the Carlos Mauricio trio **OPEN**
because no hard identifier exists — that is correct. **Do not merge money-bearing driver records on
name similarity.** Narrowing 9/21/11 to a real actionable 5 no-driver and 9 no-unit by separating
void/cancelled/draft placeholders from genuine linkage gaps is the measurement I asked for.

— Lead
