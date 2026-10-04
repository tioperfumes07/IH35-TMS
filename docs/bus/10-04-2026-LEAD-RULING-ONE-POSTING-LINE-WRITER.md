# LEAD RULING — one posting-line writer, and the register entry that declares it (2026-10-04)

**Ruling file for `LANE_CROSS=10-04-2026-LEAD-RULING-ONE-POSTING-LINE-WRITER.md`.**

## Measured

USMCA, live, `SET LOCAL app.bypass_rls='lucia'`, DIRECT endpoint:

```
accounting.journal_entry_postings      7,909
accounting.transaction_source_links    4,355   ->  3,908 postings with no lineage row
```

Nine services `INSERT INTO accounting.journal_entry_postings` directly. **Exactly one also writes the
spine row:**

| service | spine inserts |
|---|---|
| amortization-posting | 0 |
| bank-recon/match | 0 |
| journal-entries | 0 |
| lease-asc842/lease-posting | 0 |
| period-close-retained-earnings | 0 |
| recurring.worker | 0 |
| settlement-posting | 0 |
| void.service | 0 |
| **fuel-posting** | **1** |

One defect with nine doors, not nine defects.

**The ledger is not damaged.** Debits 217,802,925 = credits 217,802,925; 0 unbalanced entries; 0
postings missing their inline `source_transaction_type`/`source_transaction_id`; 3,083 reversal pairs
that all net to zero on the same account. What is damaged is what can be **found**: the purge walks
the spine, and a posting absent from it is neither purged nor recognised when the same document is
uploaded again. That is how a duplicate is born.

## The cross

`scripts/money-engine-linkage-register.json` has **no owner** in `docs/bus/LANES.md`, so
`verify-lane-ownership` refuses it from every seat. The file is not optional here:
`verify-money-engine-linkage` fails any new money writer that is not declared in it — correctly, since
a new way to create money must never appear silently. The Lead crosses for this one file, to add one
entry, declaring `accounting/posting-line-writer.ts` with the stamps it actually carries
(`operating_company_id`, `account_id`, `load_id`) and its reverse (`accounting/void.service.ts`).

The journal-entry linkage **is** carried, under the real column name `journal_entry_uuid`. The
register's stamp vocabulary spells it `journal_entry_id`, which this file does not contain, so it is
declared **missing** rather than claimed falsely. A register that overstates is worse than one that
understates.

## Ruling

1. The Lead crosses into the unassigned `scripts/money-engine-linkage-register.json` for exactly this
   one entry. No other entry is touched, no stamp is removed from any existing engine, and the
   open-reverse-debt list is left at 4.
2. `scripts/money-engine-linkage-register.json` should be given an owner in `LANES.md` — proposed:
   **CC-1**, alongside the other `scripts/` gate files. Proposed here rather than taken, because a
   `LANES.md` grant affects every seat.
3. **No backfill of the 3,908.** Writing links after the fact teaches a guard to say yes while the
   next posting through any of those doors is born detached again. The owner is purging and
   re-creating this data; with the writers fixed first, every re-created document gets a complete
   spine by construction.
4. The eight remaining services are repointed to this writer next round. Until then, new postings from
   those paths are still born without a spine row, and that gates the purge.


## Addendum — migration 202615400930, reefer diesel gets its own account (same ruling, one more lane)

`db/migrations/**` is CC-1's lane. The Lead crosses for one migration, on the owner's direct order of
2026-10-04: *"REEFER FUEL MUST BE CONSIDERED ITS OWN, IN CHART OF ACCOUNTS AND ITEMS"*, because
*"THE GOVERNMENT GIVES BACK REFUND BASED ON REEFER FUEL."*

Measured first: `fuel.fuel_transactions` in USMCA carries **diesel 263 txns / 29,590.4 gal /
$172,675.88** and **def 60 txns / 4.0 gal / $1,943.54**, and **no `reefer` type at all** — every
reefer gallon is recorded as diesel, so zero gallons are claimable. The 50xx block already separates
non-tractor fuel (5000 Fuel & Diesel · 5005 Fuel Card Fees · 5010 DEF), so **5015** is the next slot
by the same logic.

The migration creates 5015 "Reefer Diesel (Off-Highway)" as CostOfGoodsSold, binds the role
`reefer_fuel_expense` to it so posters resolve it through the role table and never by name or number
(365.1), and repoints the two reefer items that already exist. Verified against live before writing:
`org.companies.code='USMCA'` resolves, `catalogs.items.default_expense_account_id` exists, and 5015
does not. Idempotent, no hardcoded UUID, safe to re-run.

**It reclassifies no history.** The owner is deleting and re-creating this data; re-created rows land
on the right account by construction. A retroactive sweep would move money the source documents never
said to move.

**The second reason, which no seat raised:** reefer fuel is not highway fuel. With every gallon typed
`diesel`, reefer gallons are flowing into `ifta.state_gallons_by_quarter` and inflating taxable
gallons — tax possibly overpaid, in the opposite direction from the credit. Excluding reefer from the
IFTA aggregation is CC-2's ROUND 391.2 and must report the taxable-gallon delta.
