═══════════════════════════════════════════════════════════════
BLOCK D2 — TXN-EDITORS (7)  (FINANCIAL WRITE · max rigor · each GATED separately)
Phase D. Needs live QBO capture. Build as 7 sub-blocks, one at a time, each gated.
═══════════════════════════════════════════════════════════════

⚠️ Each of the 7 editors edits real financial transactions. Treat each as its OWN
gated block — Jorge's explicit OK per editor before its write path goes live.

THE 7 TRANSACTION EDITORS (confirm exact final list against live QBO before build):
  D2.1  Invoice editor
  D2.2  Bill editor
  D2.3  Payment editor (received)
  D2.4  Payment editor (made / bill payment)
  D2.5  Expense editor
  D2.6  Journal entry editor
  D2.7  Deposit / transfer editor
  (Confirm the precise 7 with Jorge + live QBO capture; adjust names to match QBO.)

EVERY EDITOR MUST (max rigor):
  - edit through a controlled flow, NOT a raw field overwrite
  - double-entry preserved: debit = credit or FAIL HARD
  - every edit EMITS a spine event (before/after, actor, source ref, qbo_id) — full audit
  - idempotency on submit
  - immutable history: an edit creates a new version / reversing-style trail; the
    original is never silently overwritten. Finalized/closed-period records: locked
    (reopen requires explicit, audited action).
  - multi-step confirm on financial change
  - stays QBO-consistent (sync, don't desync); capture qbo_id in the event
  - WRITE PATH GATED per editor until Jorge's explicit OK

PREREQUISITES
  - A-phase audit emit live (so edits are captured). LIVE QBO CAPTURE of each editor's
    current QBO screen → map fields + double-entry to the real chart of accounts.

PER EDITOR: MIGRATION only if needed (versioning/audit cols). Routes with the controls
above. verify-txn-editor-<n>.mjs: assert double-entry-or-fail, spine emit, idempotency,
immutability, gate-off-by-default. PRE-PUSH Postgres validate. Push one at a time
BLOCK_ID=D2-TXN-EDITOR-<n>, ls-remote, PR. Report PR# + SHA. DO NOT enable writes
without explicit OK per editor.
