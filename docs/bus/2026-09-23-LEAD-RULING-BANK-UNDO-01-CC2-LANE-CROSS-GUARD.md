# LEAD RULING — CC-2 LANE CROSS GRANTED: BANK-UNDO-01 GUARD
# (scripts/verify-bank-undo-releases-every-match-column.mjs + its .baseline.json — CC-1 lane)

Committed on the Lead's behalf, quoting his own written packet verbatim (the fullest of three
consecutive BANK-UNDO-01 packets, all naming the same file):

> CC-2 — BANK-UNDO-01. QBO PARITY, FULL VERTICAL. P0 ON BANKING.
> ...
> GUARD: scripts/verify-bank-undo-releases-every-match-column.mjs
>   FAILS when a bank_transaction has categorized_at IS NULL while ANY matched_*/
>   categorization_* column is still populated (half-released row), and when the undo path can
>   clear matched_journal_entry_id without that JE being reversed. Required: 0.
>   Second arm, static: the Categorized and Excluded tabs must each register a row action and a
>   bulk action — fails if the Action column renders with nothing bound, which is today's defect.

**GRANTED, verbatim** — the packet names this exact guard filename directly. `scripts/verify-*.mjs`
and `scripts/verify-*.baseline.json` are CC-1 lane; the two backend/frontend feature files
themselves (`apps/backend/src/banking/categorization.routes.ts`,
`apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx`,
`apps/frontend/src/api/banking.ts`) needed NO cross — `apps/backend/src/banking/**` is CC-2's own
lane, `apps/frontend/**` is SHARED.

**Scope of this grant:**
- `scripts/verify-bank-undo-releases-every-match-column.mjs` — three arms exactly as specified:
  live (a half-released row: `categorized_at IS NULL` while any matched_*/categorization_* column
  is still set), static (no backend file clears `matched_journal_entry_id` without also calling
  `reverseJournalEntryNoFlip` in the same file), static (the Categorized/Excluded tabs each bind a
  real row action and a real bulk action, not merely rendered).
- `scripts/verify-bank-undo-releases-every-match-column.baseline.json` — the live arm's own
  discovery: 1,858 pre-existing half-released rows found on first run, live-verified, NOT caused
  by this feature (each carries `status='pending_categorization'`/`categorized_at IS NULL` with a
  `categorization_*` column already set — most plausibly a frontend categorization-draft
  auto-save writing a partial selection before the row is ever submitted). Baselined shrink-only
  (matching `verify-alwaystrack-parity.baseline.json`'s own established convention in this repo for
  exactly this situation — a real, large, pre-existing debt a new guard surfaces), so the guard
  fails on any NEW half-released row beyond today's count, and stays informational (not a fail) on
  the already-known 1,858 — full remediation of that legacy debt is its own separate effort, not
  in scope for the Undo feature this packet asked to ship.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LYVbEZDYyiNzr5MswCc1R7
