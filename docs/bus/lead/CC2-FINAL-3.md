# CC-2 — FINAL-3 (10-25-2026 6:00 PM CT) · 10 rows · law: 10-25-2026-ALL-CODERS-FINAL-3-LAW.md

Measured against origin/main 5:40 PM. Lead closed 115, 124, 202, 252, 256 (proof in the Lead journal). Yours, top to bottom:

| Row | Item | Done = |
|---|---|---|
| 249 | ENG-11 G10 — 10 loads with a stale 10-11 linehaul next to the 10-16 one; $30,170.00 revenue overstated | rate change REPLACES the linehaul (engine rule) + the 10 loads repaired through the engine; guard: one active linehaul per load (live) |
| 248 | ENG-10 — duplicate documents 11 -> 36 groups (31 card-discount groups; Relay 10-11 $623.75, Relay 09-23 $527.58, LOVES $15.25 x3) | the writer that duplicates fixed (idempotency key) + duplicates voided through the engine; duplicate-documents guard green |
| 21 | QuickBooks unapplied credit — paid bill/invoice reduced below paid -> unapplied credit on payee | engine creates the unapplied credit (vendor/customer credit document) instead of a negative open balance; apply/refund paths; reverse path; guard |
| 84 | 5 settlement headers re-derive (P-0105/0107/0108/0109/0115); P-0115 carries two NBs incl. 13663 | headers derived from their lines (no stored totals drifting); P-0115 NB duplication fixed at the source; guard header = sum(lines) |
| 251 | ENG-13 G1 — 129 loads (10-11) with no trailer choice | back-fill from documents (BOL / rate con / dispatch record); the rest listed with why; booking requires a trailer choice |
| 81 | 222,587 duty events on merged driver shells | events re-pointed to the surviving driver (merge engine) or archived with reason; guard: no duty events on a merged-away driver |
| 254 | ENG-16 Check Creator not commissioned — check_number_registry 0 rows | build the commissioning flow (owner enters the starting check number per bank account in the app; Creator refuses until commissioned, then numbers sequentially, void keeps the number); do NOT invent a starting number |
| 255 | ENG-17 — 1090 $170,210.48 / 2510 $187,894.21 residuals | tie each balance document by document (list what makes it up); clear only through documents, never a JE plug; guards verify-cash-clearing-1090-ties / verify-dreamline-payable-2510-ties |
| 201 | 443.284 — main static reds from the 10-23 board merges | every red fixed at the root, guard green on main |
| 210 | 6,266 guard scripts (488 live, ~5,700 source-text, 316 slate-color copies) | the 316 slate-color copies collapsed into the shared guard; source-text guards either run in CI or are deleted; counts down, shrink-only |

Then: "CC2 DONE" + PR list.
