# NOW — CC-1 — KILL THE SECOND SYSTEM TABLE 1 (2026-10-03)

READ FIRST: `docs/bus/00-OWNER-ORDER-2026-10-03-KILL-THE-SECOND-SYSTEM.md`

## YOUR QUEUE RIGHT NOW (ordered)

1. **TABLE 1 — `accounting.escrow_accounts.balance_cents` DIES as authority.**
   GL: `2100-00-nnn`. Mapping row stays.
   PR1 = REPOINT READERS to `journal_entry_postings` (no migration this hour).
   Guard `verify-escrow-accounts-equals-its-gl` ceiling 0. No hand-repair of the 19 drifted rows.
   Deadline 2026-10-03 15:30Z.

2. Tables 2–5 escrow_balances + escrow_ledger.running_balance — after PR1 on tip, one PR each.

3. Tables 6–7 `driver_advances.outstanding_balance` · `driver_liabilities.current_balance`.

4. **R-1 — Driver Damage Loss 6176** — AFTER table 1. Read 2100, never the dying column.

ACK: `CC-1 | ACK KILL-SECOND-SYSTEM TABLE-1 | GO`

NO seed. NO Chrome. Fix writers. USMCA only.
