# Faro load-linkage register — CLOSED, 2026-09-22

## Closing position — verified live

```
factor.faro_invoice_lines (USMCA, superseded_at IS NULL)
  total lines    104
  linked         104
  unlinked         0
```

`scripts/verify-faro-invoice-lines-load-linkage.mjs`, run live against Neon prod
(`tiny-field-89581227` / `br-fancy-credit-akjnd07a`) after the final link:

```
verify-faro-invoice-lines-load-linkage: LIVE PASS — 104/104 live USMCA faro_invoice_lines rows
carry a real load_id.
```

**Closed. Every live Faro invoice line in USMCA carries a real `load_id`.**

## How it closed

- **CC-1 backfilled `customer_wo_number`/`customer_po_number`** on 61 of the 116 existing loads
  (13463–13618) that had never had them populated at creation — the actual root cause, not a
  matching-code defect.
- **The owner cross-matched Faro's PO column against live loads** on exact customer + exact
  amount, resolving 43 of the original 44 unlinked lines (17 unambiguous, 8 after legal-suffix/DBA
  normalization, 18 more once the collision set was worked — the Semares $4,900 cluster resolved
  by exact W.O., never by amount, since amount alone could not separate 8 invoices from 7 loads at
  the identical figure). Applied directly to prod; verified live, not re-derived.
- **FARO-061 — the one line the owner's first pass didn't close** — resolved here, by W.O. only,
  per instruction (Faro `PO` = AlwaysTrack `customer_wo_number`, exact match, no amount-matching):
  PO `6492969` → exactly one load, `13585`, real (`is_sample_data=false`), `dispatched`. Linked
  live: `UPDATE factor.faro_invoice_lines SET load_id = 'd603567d-3f8c-4f97-a116-729e4378db65'
  WHERE invoice_number = 'FARO-061'`.

## The owner's withdrawn claim, noted for the record

An earlier instruction to create ~14 "missing" loads (13512, 13513, 13537, 13538, 13542, 13543,
13545–13551, 13459) was **withdrawn by the owner in writing**
(`~/Downloads/09-22-2026-Claude-Coder-2-YOU-WERE-RIGHT-I-WAS-WRONG-FARO-CLOSES-AT-103-OF-104.md`)
after CC-2 refused to close the register on that claim without live verification. 13 of the 14
loads already existed — real, `status='closed'`, each already linked to exactly one Faro line —
and only 13459 was genuinely absent. **No load was created.** 13459 stays uncreated: no source
document, no load, per the owner's explicit instruction not to create one to make a register tidy.

## Two links — OPEN, EVIDENCE NOT ON FILE (Lead ruling, 2026-09-22 23:45 CT)

Load-linkage is closed at 104/104 — this does not mean every one of the 104 is evidenced. Two of
the 43 the owner applied live are contested and the Lead has ruled: **neither reverted, neither
treated as proven.**

- **`FARO-092` (Refrigerx, PO `1013583-2`) → load 13613.** Load 13613: `customer_wo_number` NULL,
  `customer_po_number` `4504493857` (does not match `1013583` in any form). Link is live in
  `factor.faro_invoice_lines`, not reverted.
- **`FARO-049` (AB Global, PO `0061409`) → load 13567.** Load 13567: `customer_wo_number`
  `0061417` — a different number from `61409`, not a zero-pad variant. Link is live, not reverted.

CC-1 asserted both mappings and owes the AlwaysTrack settlement document or Faro invoice PDF that
ties each one, or a written withdrawal — posted to `docs/bus/OUTBOX-CC-1.md`, carried there until
answered. Not resolved by amount-matching, per standing rule.

## What this closes out permanently

- **`docs/bus/OUTBOX-CC-2.md`'s ROUND 29.7 line** ("44 ... correctly Faro-native references, never
  invoiced by us by definition") and this session's own "Bucket (c) genuinely unresolvable" line —
  both already retracted in that file (WORM, appended not edited); this document is the closed,
  final state their retraction pointed at.
- **The synthetic-invoice-number finding stands, unresolved, separate from linkage:** these rows'
  `invoice_number` is still the synthetic `FARO-<n>` label, not Faro's real invoice number, and
  `factor.faro_invoice_lines` still has no PO column — both still open, migration request already
  posted to `docs/bus/OUTBOX-CC-1.md`, not part of the load-linkage closing position above.

## CLOSED — FARO-092 → 13613 (Lead ruling, 2026-09-22, later same session)

CC-1's mapping WAS RIGHT. AlwaysTrack's own Unsettled Loads screen shows load 13613 with
W.O. `1013583-2` — that IS Faro invoice 92, $5,700.00, purchased 9/21. The gap above was never
the mapping; it was our own app's field: load 13613 carries `customer_po_number` `4504493857`
and a NULL `customer_wo_number`, so the evidence could never resolve FROM OUR DATA even though
the link itself was correct. Evidence: AlwaysTrack Unsettled Loads screen, 2026-09-22. Per the
Lead's instruction, NOT patched in place — the settlement purge/refeed rebuilds this load's row
from the real source documents, and that is where `customer_wo_number` gets a real value.
Recording the evidence here is the fix for this register; the data-state fix rides with the
refeed. `FARO-049 → 13567` (the other of the two links above) remains OPEN, unchanged — this
closure applies to 13613 only.
