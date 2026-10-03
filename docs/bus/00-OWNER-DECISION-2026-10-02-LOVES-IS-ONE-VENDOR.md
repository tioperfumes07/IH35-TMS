
---

# OWNER DECISION — 2026-10-02 — "LOVES" AND "LOVES TRAVEL STOPS" ARE THE SAME VENDOR

Owner, asked directly whether the two rows are the same vendor, answered: **"YES THEY ARE."**

That closes the question CC-2 raised in #23954. The canonical-vendor engine will not guess, and it
no longer has to.

## THE RULING

`LOVES` and `LOVES TRAVEL STOPS` are one real vendor and merge into one canonical
`mdata.vendors` row. They do not normalize equal — `LOVES` vs `LOVESTRAVELSTOPS` under
`upper(regexp_replace(name,'[^A-Za-z0-9]','','g'))` — so this is a **named owner exception**, not a
normalization rule. Do not loosen the normalizer to make them match; a looser normalizer would
start merging vendors the owner never approved. Record the pair as an explicit exception in the
engine's exception list, with this ruling cited.

Why it matters, measured: LOVES is 494 of 523 vendor transactions and $177,911.29 of $185,914.44 —
**95.7% of every dollar paid to a vendor**. Split across two rows, no vendor profile, no AP aging and
no spend concentration figure in the app is correct.

## WHO, AND WHAT STILL BLOCKS IT

**CC-2** owns this — `mdata.vendor_aliases` and the canonical engine are yours (#23954).

- Canonical row: keep the row that carries the transactions; the other becomes an alias.
- `mdata.qbo_vendors` is never written.
- Every loose `vendor_(id|uuid)` column discovered at run time repoints to the canonical id —
  including the five your own root-cause found missing from the old hand list: `bills.vendor_id`,
  `bill_payments.vendor_id`, `lease_contract.lessor_vendor_id`,
  `equipment_loans.lender_vendor_id`, `bank_transaction_splits.vendor_id`.
- Company A/P unchanged to the cent, before and after. Paste both numbers.
- Reversible, with the merge audit row.

**STILL BLOCKED, AND NOT BY THIS RULING:** the repoint `--apply` needs the owner's AUTH code. This
decision settles *which rows merge*; it does not authorize the write. Do not run `--apply` on a
chat message — the law is an OPEN, unexpired AUTH on main.

## UNCHANGED, STILL OPEN WITH THE OWNER
1. The AUTH code for the customer + vendor repoint `--apply` (1,203 duplicate customer groups /
   1,708 extra rows; rehearsed clean on `br-empty-lake-akqooohs`, A/R and A/P unchanged both ways).
2. The paid money on the 15 active TRANSPORTATION loads sitting under USMCA.
3. `factoring.reserve_movement` — 5 pre-clean-slate Faro releases, net −$7,241.00, no GL and no
   funding purchase.
