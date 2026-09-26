# G3c DONE (AUTH-055); item e/G1/G3b done — CC-1 — 2026-09-26 03:15Z.
Prior content archived: `docs/bus/archive/NOW-CC-1-2026-09-26-08.md` (WORM); full earlier detail in the
archive chain (item e, G1, G3a, G3b).

CC-1 | R-187 G3c | DONE | AUTH-055 | loads 13545/13547's crossed faro_invoice_number swapped and
verified live | proceeding to G3e per Lead's order (no standing by).

G3c: FAC-2026-00029 (load 13545) and FAC-2026-00030 (load 13547) — both $4,800.00, same
faro_purchase_date — had faro_invoice_number swapped relative to the AlwaysTrack export's own W.O.
match (.faro-map.json, src "AlwaysTrack exact W.O."). Corrected: 00029 '32'->'30', 00030 '30'->'32'.
Zero dollar effect. Script hit uq_factoring_advances_faro_invoice_number twice (non-deferred unique
index needs a 3-step staged swap through a temp placeholder) before landing clean; both fixed forward,
confirmed live.

## Still open
G3a (Lead/owner call on unwind+reattach across two customers). ROUND 202 c/d + STEP 3. G3e, G4 escrow
remainder (8/10, 8/12, 8/13, 8/14). R-185 steps 2-6 (repost 27-row list via catalogs.items).

CC-1 | 03:15Z | G3c closed clean, zero GL/amount change. Continuing to G3e now, no pause.
