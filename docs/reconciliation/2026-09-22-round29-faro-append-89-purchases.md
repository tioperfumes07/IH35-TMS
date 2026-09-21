# Round 29.6 — Faro append-only import (item 2), live and verified

## Item 1 (trace) — resolved as far as evidence allows
Full write-up already in `docs/reconciliation/2026-09-21-round27-28-faro-invoices-handoff.md`.
Owner-accepted verbatim in the Round 29.6 ruling: the 09-04 header was a direct DB write outside
the app; values corroborated at 51/$151,740.00 across three independent sources in
`docs/bus/2026-09-07-Cursor-USMCA-AlwaysTrack-Reconciliation-State.md`. **New standing rule (owner,
2026-09-22): any `factor.faro_daily_imports` row whose `raw_payload` does not match `FaroCsvLine`
shape is UNTRUSTED PROVENANCE** — flag it, never delete it, never let it source a reconciliation
run without that flag being addressed. Not yet enforced in code — see REMAINING below.

## Item 2 (import) — additive, live, verified

**Owner ruling accepted:** `FARO LOAD MAP` (the owner's workbook) is deliberately scoped to loads
13552–13618 only — the AlwaysTrack settlement universe (5786–5816) — not the whole Faro book. Loads
13508–13551 were reconciled in an earlier round and are correctly already in the 34 existing lines.
**Do not supersede the 09-04 statement. Add only.**

**Source of truth for this append:** the owner's live Faro portal exports pulled 2026-09-21,
specifically `~/Downloads/export (27).csv` (Purchases — 89 data rows, Debtor/Date/Inv#/PO/Purchase/
Escrow Rsv/Discount/Net Adv/ChgBack), not the derived workbook sheets used in the prior round.

### What ran
New, real, tested function `appendFaroInvoiceLinesOnClient` /
`appendFaroInvoiceLines` in `apps/backend/src/data-infra/data-infra.service.ts` — the additive
sibling to `upsertFaroDailyImportOnClient`. That function always supersedes-then-reinserts an
*entire* batch; this one inserts only invoice_numbers not already present (non-superseded) for a
`daily_import_id`, touches nothing else, then recomputes the header totals as
`sum(all lines, old + new)` — the same formula the app already uses everywhere. Idempotent (a
re-run skips already-inserted lines instead of erroring or duplicating). 4 unit tests, all passing.

Matching (PO → `mdata.loads.customer_wo_number`, USMCA), with PO normalized (strip leading `#`,
strip leading zeros) after confirming two real Faro-export formatting quirks against the DB's own
stored data (load 13551's stored PO carries a `#` the export's cell doesn't; load 13565's stored
PO "488" vs the export's "0488"). One raw-export row has its Inv#/PO cells transposed relative to
every neighboring row (Refrigerx, 09/08/2026) — corrected explicitly in code, not silently.

Of the 89 export rows: **19 already matched one of the 34 existing lines** (skipped, confirmed
correct — not re-inserted). **2 PO collisions** (one Faro PO matching two different USMCA loads)
were resolved using `FARO LOAD MAP`'s own VERDICT column — the non-matching load in each pair is
`NOT PURCHASED — SELF-CARRIED AR`, so only one candidate could be the real Faro purchase:
- PO `0488` (Faro inv 036, Hummingbird, $4,000.00): 13556 excluded (self-carried); 13565 already
  carries `gross_amount_cents=400000` in the existing 34 — exact match, no new row needed.
- PO `1013272-2` (Faro inv 059, Refrigerx, $5,210.00): 13578 excluded (self-carried); 13579 is
  Completed and genuinely new.

**70 new lines inserted** — 26 with a resolved `load_id`, 44 with no matching USMCA load (Faro
purchased them; we have no load number to point at). Per the owner's own ruling ("a Faro invoice
with no load link is NOT an error"), these are stored with `invoice_number = "FARO-<inv#>"`
(Faro's own 3-digit sequence, never collides with a 5-digit load number) and `load_id = NULL` —
never a guessed load FK. Full per-row decisions (including the 19 already-present and both
resolved ambiguities) are in the committed data file
`docs/reconciliation/2026-09-22-faro-append-lines.json`.

**16 of the 34 existing lines were never matched by any of the 89 export rows.** Consistent with
being real Faro purchases made 2026-08-07–08-09 (before this export's 08/10 start date) — the
load-number range (mostly 13508–13534) supports this. **Not individually re-verified beyond that
pattern and the two confirmed cases above — named as an open item, not claimed proven.**

### Live proof (Neon `br-fancy-credit-akjnd07a`, USMCA, `bypass_rls=lucia`)
- Before: `factor.faro_invoice_lines` for `daily_import_id=c1e27709…` = 34 rows, header gross
  $151,740.00 (the untrusted-provenance memo value).
- After: **104 rows** (34 + 70, confirmed by count). Header recomputed to
  **gross $356,787.00 / advance $314,029.38 / reserve $5,208.19 / fee $5,441.82 / chargeback
  $0.00** — exactly `sum(all 104 non-superseded lines)`, verified by independent `SUM()` query.
- Spot-checked 4 of the original 34 (`039`, `13508`, `13510`, `13568`) post-append: identical
  `gross_amount_cents` to before the append — genuinely untouched.
- Sum of the 89 export rows' own Purchase column, computed independently in Python: **$311,587.00
  exactly** — matches the owner-stated control total, confirming the parse/money conversion is
  correct before any of it touched the database.

### REMAINING (named, not silently dropped)
- The "untrusted provenance" flag/assertion at write time (owner's new standing rule) is not yet
  built — the header's `raw_payload` still carries its old, wrong-shaped memo content from the
  09-04 correction two rounds ago. Needs a migration/column or a documented convention, not decided
  here.
- The 16 unmatched-existing lines' pre-08/10 provenance is asserted from pattern, not individually
  re-verified against a pre-08/10 export (none pulled this session).
- Escrow-as-asset / fee-recognized-on-close accounting treatment, the 8 direct legs, the 5 reserve
  deposits, the 5 self-carried invoices' AR posting, first `reconciliation_runs` row, daily close,
  the 13609 four-line invoice split, and the accessorial/chargeback catalog concepts are all **not
  started this pass** — each is its own real block, not attempted blind under the remaining time in
  this session.
