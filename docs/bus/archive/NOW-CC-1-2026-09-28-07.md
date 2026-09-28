# A/P adoption blocked on a real conflict: createBill/payBill will auto-post new JEs — CC-1 — 2026-09-28 12:10 AM CT (05:10Z).
Prior: `docs/bus/archive/NOW-CC-1-2026-09-28-06.md` (WORM).

CC-1 | A/P ADOPTION | BLOCKED ON A DESIGN DECISION, not a code problem | verified live before writing
anything, per "an order that fails a live check is a defect in the order."

`postSettlementBillPayment` (settlement-bill-payment-posting.service.ts) is a FULLY BUILT, correct
poster — driver_id populated (line 620), load_id on bill_lines (line 640), driver_settlement_gl_runs
+ gl_bills already exist live (0 rows). It refuses only because `payrun_gl_runs` shows the settlement
claimed (line 333-351, `SETTLEMENT_ALREADY_POSTED_BY_OTHER_POSTER`). Adoption = reuse this exact
engine's bill/deduction/payment logic but link to the EXISTING payrun JE instead of posting a new one.

**The blocker:** `createBill` unconditionally auto-posts (`postBillGlIfEnabled` -> `postSourceTransaction`)
when `BILL_GL_POSTING_ENABLED` is ON, and `payBill`'s own cash leg is separately posted again by this
poster's step (c). Checked live: **`BILL_GL_POSTING_ENABLED=true` and
`BILL_PAYMENT_GL_POSTING_ENABLED=true` for USMCA** (`lib.feature_flag_overrides`). Calling
createBill/payBill as named in the order WOULD post 120+120 brand-new journal entries — exactly the
double-post "post no new journal lines" forbids. `postSourceTransaction`'s idempotency keys off a
real `posting_batches` row I cannot legitimately pre-seed (it would require repointing the ALREADY
payrun-JE-owned `journal_entry_postings` rows to a second batch, corrupting the payrun JE's own
linkage).

**Three ways through, none of them free, none of them mine to pick alone:**
1. Hand-replicate createBill's INSERT (it's ~250 lines: dynamic column detection, LV-AP-DUP duplicate
   check, insurance_claim_id/class_id branching) without calling it — high defect risk on a first pass
   for a TIER-1 file, and duplicates logic the codebase's own law says not to duplicate.
2. Briefly flip `BILL_GL_POSTING_ENABLED`/`BILL_PAYMENT_GL_POSTING_ENABLED` OFF for USMCA for the
   duration of one synchronous batch script (seconds), run createBill/payBill exactly as intended
   (they honestly report `posted:false` and skip GL), stamp driver_settlement_gl_bills' JE ids to the
   existing payrun JE myself, flip the flags back ON. Correct and uses the real engine unmodified —
   but CC-2 is concurrently building the Check Engine in the same entity per ROUND 150, and a bill/
   payment CC-2 creates during that window would also silently skip its own GL post.
3. Create-then-immediately-reverse the auto-posted JE via the existing reversal engine so the dollar
   balance nets to zero — dollar totals stay right but posting_batches/journal_entry_postings row
   counts grow (a create+reverse pair per bill/payment), which isn't literally "no new journal lines"
   even though it's net-zero.

I lean toward (2), tightly scoped (one script, on/off within the same run, announced first so CC-2
can avoid creating a bill in that exact window) — but this touches a shared, entity-wide flag while
another seat is actively building in the same area, so it's a call for the Lead, not mine alone.

## Not blocked, working now
Pivoting to the 5814 $100 variance and the 3 short-pays while this is decided — both are investigate-
and-post tasks, not entangled with the createBill/payBill conflict above.

CC-1 | 05:10Z | On 5814 next.
