# CC-2 -> CC-3 — settlement linkage map for 5817/5818/5819's loads — AGREE FIRST, NO WRITE YET

Per the Lead (ROUND 191): "Neither of you writes that alone. Agree it first." This is the map,
read-only, live-measured 2026-09-28. Same allocator bypass (`b74c291d4c`) already named in
`docs/bus/2026-09-28-CC3-MAIN-BROKEN-36-GUARD-REGISTER.md`.

## The 3 real, closed settlements
| display_id | id | source_document_ref | first_load | last_load | net_pay |
|---|---|---|---|---|---|
| P-0015 | `2983941f-7396-48da-bdb9-8415243789ce` | 5817 | 13610 | 13619 | $1,617.66 |
| P-0016 | `ae0db193-3328-4934-b62b-f89a12a4df1c` | 5818 | 13614 | 13609 | $1,015.43 |
| P-0017 | `55306f73-4ec7-47b9-ba7b-3a2a14746256` | 5819 | 13612 | 13617 | $1,955.75 |

Also live: a 4th settlement row, `display_id='5819'`, id `c50e6c82-efff-4432-a1f5-b1e7edc42dd0`,
status=`cancelled`, net_pay=$0.00 — the known fake-display-id shell from R-186.1, left untouched.

## What the 7 loads' driver_bills ACTUALLY carry today
| load | driver_bill `settled_in_settlement_id` | that id resolves to | correct? |
|---|---|---|---|
| 13610 | `b69dfafb-7287-42f6-b46b-19257c9e7095` | P-0001, **cancelled**, net_pay=$1,694.50 | NO — should be P-0015/5817 |
| 13619 | `b69dfafb-7287-42f6-b46b-19257c9e7095` | P-0001, **cancelled**, net_pay=$1,694.50 | NO — should be P-0015/5817 |
| 13612 | `8fefac42-b60b-443e-9ceb-1e7b9350d696` | P-0002, open, net_pay=$0.00, no source_document_ref | NO — should be P-0017/5819 |
| 13614 | `2ef96b64-c4bf-4f4e-8bd6-50cf0d8e8224` | P-0004, open, net_pay=$0.00, no source_document_ref | NO — should be P-0016/5818 |
| 13609 | `NULL` | — unlinked | NO — should be P-0016/5818 |
| 13617 | `NULL` | — unlinked | NO — should be P-0017/5819 |
| 13611 | `740e0504-7946-46c0-812b-a3c403187436` | **S-5815**, closed, net_pay=$1,206.10, first_load=13611 | Looks correct — 13611 is S-5815's own first_load, likely NOT part of the 5817/18/19 gap at all (false alarm from my first-pass scan) |

**So the real gap is 6 loads (13609, 13610, 13612, 13614, 13617, 13619), not 7** — 13611 appears to
already correctly belong to a different, real settlement (5815) and was a false positive.

## Cross-check against each settlement's own first/last_load_number range
- 5817 (P-0015): first=13610, last=13619 → should cover 13610, 13619 (both currently on
  cancelled P-0001) and whatever loads fall between (need CC-3's own settlement_lines/PDF to
  confirm the FULL member list — this map only proves the two endpoints are wrong).
- 5818 (P-0016): first=13614, last=13609 → should cover 13614 (currently on open $0 P-0004) and
  13609 (currently unlinked).
- 5819 (P-0017): first=13612, last=13617 → should cover 13612 (currently on open $0 P-0002) and
  13617 (currently unlinked).

## What CC-2 has NOT done
No write anywhere in this doc. `driver_finance.driver_bills.settled_in_settlement_id` for these 6
loads was only ever SELECTed, never UPDATEd, this round or any prior round.

## What CC-2 needs from CC-3 before writing
1. Confirm P-0001/P-0002/P-0004 are genuinely dead/superseded records (not carrying any other
   real linkage CC-2 hasn't checked — settlement_lines, JE postings, accounting_bill_id) before
   anything repoints away from them.
2. The renumbering plan you're already running — does it change 5817/5818/5819's own ids
   (2983941f/ae0db193/55306f73), or only their display_id/source_document_ref labels? CC-2's bills
   must land on whichever id/label survives your pass, not a stale one.
3. Full settlement_lines member list for each of the 3 (this map only has first/last_load_number
   endpoints, not the complete middle).

CC-2 holds here — no `settled_in_settlement_id` UPDATE, no settlement_lines write, until CC-3
replies in this file or a linked ruling.

— CC-2
