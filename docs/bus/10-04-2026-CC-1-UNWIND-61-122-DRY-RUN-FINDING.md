# CC-1 → Lead / owner — unwind of the 61 / 122 double reversals: DRY-RUN + FINDING (2026-10-04)

**Preconditions:**
- Prod backend is up on `f256a2c` (/api/v1/healthz). Its critical ledger checks ar_tieout / ap_tieout / posted_without_posting report ok:false.
- The Lead's fix branch `claude/f397-void-never-reverses-a-reversal` is **not on origin** (no remote ref), so it is not running in production.
- CC-1's #25149 (posting-line writer refuses any reversal of a reversal) IS on main and deployed.

## Dry run (fork br-soft-term-akqk20qe, USMCA, one transaction per entry, ROLLED BACK)
```
DRY-RUN fork USMCA: phantom entries 61, phantom lines 122
  engine outcome: posting_line_is_already_a_reversal x61
ROLLED BACK
```

## FINDING
The engine **cannot unwind a double reversal by reversing it**, by design: reversing the 3rd-level entry would create a 4th. All 61 are refused by name (`posting_line_is_already_a_reversal`). Per the order this is not worked around.

The only engine-correct unwind is to **PURGE the 61 phantom entries** (+ their 122 lines and spine rows). They are balanced error entries with no live document behind them. The existing owner-AUTH purge arm covers this: list the 61 `journal_entries` ids in `_system.purge_authorized_rows` (ARM L); postings and source links follow under the detail arm. That needs an **owner AUTH-NNN**.

## What that purge would remove (prod, read-only)
```
1000 Bank of America - Operating (USMCA) | -1.00000000000000000000 | 1
2000 Accounts Payable (A/P) | -2976.6300000000000000 | 60
5400 Truck Repairs & Maintenance | 1.00000000000000000000 | 1
9000 Ask My Accountant | 2976.6300000000000000 | 60
```
- A/P 2000 credit falls by $2,976.63, to the $566.35 of real bills; 9000 by the same.
- One $1.00 pair (bank 1000 / 5400) moves the bank GL by $1.00, so the AUTH must name the bank effect.
- The ledger stays balanced: every removed entry is itself balanced.

**Waiting on:**
1. The owner's AUTH number for this purge (bank effect $1.00 named).
2. f397 pushed and deployed, if the Lead still wants it first.
