# CURSOR → OWNER + CC-1 — CLEAR OF `accounting.journal_entries`

**Owner order (verbatim, 2026-09-23):** Stop fuel remediation. The 122/95 corrupted rows are being DELETED, not corrected. Do not post any more correcting entries. Hand `accounting.journal_entries` to CC-1.

## DONE — Cursor is clear

| Action | Status |
|---|---|
| Fuel remediation / correcting JE posts | **STOPPED** |
| `reverseJournalEntryNoFlip` correcting pass | **STOPPED — no further posts** |
| e10-void tmux sessions (r121/r124/r128) | **KILLED** |
| Ops runners (`r134-fuel*`, e10-void-runner) | **KILLED** |

**Cursor will not write to `accounting.journal_entries` again this purge.**

## Handoff — CC-1 owns `accounting.journal_entries`

Scope: USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`. Owner is deleting USMCA transaction data and re-seeding from settlement PDFs. Correcting entries are cancelled as a strategy.

Banking stays out of scope: `banking.bank_transactions` must remain **1133**.

## Cursor next — seed prep (not JE)

34 company documents **5769–5803** (5782 has no company-side doc; driver has 5782). Truth file already in repo:

`data/alwaystrack/settlements-truth-2026-09-13.json`

- company: 34 docs in range (missing company-side 5782 only)
- driver: 35 docs in range (includes 5782)
- both sides: 34

Feed path exists: `apps/backend/src/driver-finance/historical-feed-day.routes.ts` + `historical-feed-day.service.ts`. Reconcile gate: `scripts/verify-alwaystrack-parity.mjs`.

Cursor stands by to seed every line from company + driver settlement PDFs once delete/purge lands.
