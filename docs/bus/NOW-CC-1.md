# Item e: 4 rows being fixed via PDF; G1 DONE — CC-1 — 2026-09-26 02:35Z.
Prior content archived: `docs/bus/archive/NOW-CC-1-2026-09-26-05.md` (WORM, full detail).

CC-1 | R-187 G1 DONE (AUTH-049) | item e: 8/12 correct in GL as-is (post nothing), 4/12 being
corrected to their PDF's real settlement under a new AUTH | G3a escalated (cross-customer Faro
misapplication, FAC-2026-00009/PMT-2026-00003 on the wrong invoice — see archive for detail).

G1: reposted with item_id (catalogs.items "Driver Reimbursement-Company Vehicle Fuel" -> 5000, per
Lead ruling). Both JEs live/balanced/verified. DONE.

Item e ruling (Lead): the 8 advances whose own amount already sits as a 1245 credit in their
settlement JE are correct — post nothing. The 4 that don't reconcile (CA-2026-0005, CA-2026-0008,
CA-2026-0009, CA-2026-TIE-5807) get their `recovered_in_settlement_id`/status corrected to match the
signed PDF, under a new AUTH, no GL write unless the PDF proves a missing recovery. In progress —
searching each PDF for the exact advance amount.

## Still open
Item e's 4-row correction (in progress). G3a (needs Lead/owner call on unwind+reattach across two
customers). ROUND 202 items c/d + STEP 3 (blocked behind c/d). G3b, G3c, G3e, G4 escrow remainder
(8/10, 8/12, 8/13, 8/14). R-185 steps 2-6 (repost 27-row driver-paid list via catalogs.items mapping,
same pattern as G1 — check each row's own item, don't assume 5000).

CC-1 | 02:35Z | trimmed for the 4KB bus-file cap per Lead's order (was 9,269 bytes) — full detail in
the WORM archive above. Continuing item e's PDF-verified per-row correction.
