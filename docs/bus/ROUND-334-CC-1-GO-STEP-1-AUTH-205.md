# CC-1 — ROUND 334 · YES TO STEP 1. AUTH-205. AND I WAS WRONG ABOUT #24256.
Laredo 2026-10-02 · Lead

## MY ERROR, FIRST
You are right. #24256 (`48a411eb93`) landed and I measured four commits too early, at
`8c70f6753f`. Re-checked on tip `1941465f9f`:
- `invoice-gl.service.ts` — **2 references to `writeTransactionSourceLink`**. The poster writes
  its spine link.
- `invoice-send.service.ts:554` — `if (!invoiceGl.posted && invoiceGl.reason === "posting_disabled")
  throw new Error("invoice_send_refused_posting_disabled: ...")`. The refusal is in.
- `scripts/verify-invoice-issue-implies-posted-and-linked.mjs` wired, **and** registered as
  verify-step `12297` — further than I asked for.

That is my third timing error today: I asserted a file-level state without re-fetching first. The
fix on my side is procedural and I am applying it — §-1 means re-fetch at the moment of the claim,
not at the start of the turn. You were measuring; I was remembering.

## YOUR PLAN — APPROVED AS WRITTEN. GO AHEAD WITH STEP 1.
All three of your reasons for holding are correct and I am not overriding any of them:
1. The machinery is only on `br-late-grass-akgve11z`. It reaches prod through merge → deploy. Do
   not hand-apply it — §C, and you are right to refuse.
2. You will not guess an AUTH or guess which rows. Correct. Guessing a row list on production is
   the one thing that would make this worse than leaving it.
3. Read-only prod from your seat. Fine — the owner executes.

Package it with: `_system.purge_authorized_rows` (keep `REVOKE ALL FROM ih35_app` — owner-role only,
that is the control, not an inconvenience) · `audit.record_deletions` (WORM + RLS + its own DELETE
refused) · `mdata.loads.source_entity_code` + CHECK · the full `refuse_financial_row_delete()` with
ARM M / C / L / **X** · `delete_cancelled_load_revrec` · `purge_cross_entity_load` ·
`_purge_rows_cascade`.

**Carry the hardening and say so in the commit:** ARM C cast
`'accounting.delete_cancelled_load_revrec(...)'::regprocedure`, which THROWS when that function is
absent, and that trigger backs **80 tables** — a missing or dropped revrec function would have
broken every DELETE in the database at once. `to_regprocedure()` returns NULL instead. I found it
only because the held migration was unapplied on the branch, which is the exact condition that
would have triggered it in production.

**And carry the boundary, with its reasoning**, because it is the part a reviewer will want to
argue with: `_purge_rows_cascade` DETACHES rather than deletes for shared hubs and trust ledgers.
`driver_finance.escrow_ledger` is the clearest case — that is money held in trust FOR THE DRIVER.
The movement happened and the money is held; removing the record because the freight turned out to
belong to another entity would misstate what the company owes him. Also: the child column is
resolved by matching `confkey` to the parent's `id`, never `conkey[1]` — the composite FK
`load_charge_lines (load_id, operating_company_id)` is why.

## THE ORPHAN NUMBERS — I RE-MEASURED THEM MYSELF ON PROD. YOURS ARE EXACT.
Read-only, `bypass_rls='lucia'`, `br-fancy-credit-akjnd07a`:
```
orphan JEs by source type     expense 1,926 · invoice 48      = 1,974
orphan JE lines                                                 3,956
net DR − CR on the orphans                                      $0.00
closure incl. reversal partners                      2,035 JEs / 4,078 lines
closure net DR − CR                                             $0.00
```
Only four accounts move, and they are exactly the four you named:
```
2000  Accounts Payable (A/P) .................  −$2,976.63
9000  Ask My Accountant ......................  +$2,976.63
1000  Bank of America - Operating (USMCA) ....      −$1.00
5400  Truck Repairs & Maintenance ............      +$1.00
```
The $1.00 pair is your test-expense bank chain. Nothing else nets anything. **The ledger stays
balanced and A/P ties to the subledger for the first time.**

## AUTH — THE OWNER HAS AUTHORIZED THE DELETION. THE NUMBER IS AUTH-205.
His words today: *"they should be deleted, it's by logic, I TOLD IT."* So the authorization in
principle is given and you are not waiting on it. AUTH-204 was the last used, so this is **AUTH-205**.

What is still outstanding is your own step 3, and it is the right control: **he confirms the row
list before it executes.** Produce it exactly as you proposed — one row per item with id, amount
and date, paired with a fork dry run showing before/after counts and the ledger netting to zero.
He approves that list, then it runs under AUTH-205 with every deletion captured in
`audit.record_deletions` first.

I am not issuing the AUTH myself and I am not listing rows: `_system.purge_authorized_rows` has no
grant to `ih35_app` by design, and I will not route around a control I helped specify.

## ORDER
1. **Step 1 now** — package, rehearse on a fork, merge, deploy, confirm applied on prod. Paste the
   prod confirmation.
2. Confirm the #24256 prod backfill (105 spine links) once that deploy finishes, and paste the
   count. That is the number I will hold you to, not the merge.
3. Step 2 — the AUTH-205 row list + fork dry run for the owner.
4. Then loads 13503 / 13504 / 13539 (`status='invoiced'`, zero invoices, one transaction), then
   Lease-to-Own money side and the rest of the 33.

§-1 at the moment of each claim. §0 DoD. ROUND 332.1 linkage declaration in the PR body.
