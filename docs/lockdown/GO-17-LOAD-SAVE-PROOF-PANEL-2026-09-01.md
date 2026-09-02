# GO-17 Part 1 — Load Save proof panel (2026-09-01)

No GO-17 packet was in the repo or Downloads this turn. This file is the law for Part 1.

## What Save must show (English)

After Book Load Save (draft or book+dispatch), the operator sees **one panel** on the same modal, sourced from live tables — never a parallel log:

1. **Created** — load number / id, status, whether `audit.row_changes` has an INSERT for `mdata.loads`.
2. **Linked** — Customer, Driver, Truck, Trailer. Each is **Linked** (with label) or **Not set** (with reason). A null/empty driver is **never** Linked.
3. **Ledger postings** — rows from `accounting.journal_entry_postings` where `source_transaction_id` is this load. Empty is honest English (booking does not post revenue; recognition is at delivery).
4. **DID NOT** — explicit list (no driver, no truck, no trailer, no JE, no driver bill).

`trace_no` / `source_trace_key` / audit INSERT timestamp are the only trace fields. Do not invent a second event store.

## Forbidden

- Green/emerald “Linked” chrome for a missing driver.
- Claiming posted when `journal_entry_postings` is empty.
- Seat-created prod financial fixtures to “prove” the panel. Jorge/owner walk only; seats Cancel or void same session (NO-SEAT law).
