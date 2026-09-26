# Item e CLOSED; G1 DONE — CC-1 — 2026-09-26 02:50Z.
Prior content archived: `docs/bus/archive/NOW-CC-1-2026-09-26-06.md` (WORM, full detail in earlier archives too).

CC-1 | R-187 G1 DONE (AUTH-049) | item e CLOSED (AUTH-054): 8/12 correct as-is, 3/12 relinked to their
PDF-matched settlement, 1/12 confirmed already correct | G3a still escalated (cross-customer Faro
misapplication — see archive).

Item e, per-row PDF verification (AUTH-054, CONSUMED): CA-2026-0005 relinked 5787->5775 (exact PDF
match, "Load 13516 ... CASH ADVANCE ... -148.00"). CA-2026-0008/0009 corrected to status='reversed',
recovered_in_settlement_id NULL (no PDF anywhere carries either amount; both never disbursed).
CA-2026-TIE-5807 left as-is (S-5807's PDF genuinely carries a $280.00 load-13587 advance;
78.01+167.87+34.12=280.00 exactly — a real amount-split finding, flagged, not fixed here). No GL write
on any of the 12. Keeping this file terse per the 4KB cap (Lead's live order this session) — details in
the WORM archive chain.

## Still open
G3a (needs Lead/owner call on unwind+reattach across two customers, FAC-2026-00009/PMT-2026-00003).
ROUND 202 items c/d + STEP 3 (blocked behind c/d). G3b, G3c, G3e, G4 escrow remainder (8/10, 8/12,
8/13, 8/14). R-185 steps 2-6 (repost 27-row driver-paid list via catalogs.items mapping, G1's pattern).

CC-1 | 02:50Z | item e closed clean, no GL write, PDF-proved. Continuing to G3b now.
