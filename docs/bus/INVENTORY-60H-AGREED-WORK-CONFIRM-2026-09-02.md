# IH35 USMCA — 60h agreed work inventory (for Claude coder confirm)

**Date:** 2026-09-02  
**Scope:** USMCA only; seats never POST Book Load; confirm BUILT vs PENDING against `origin/main` + Neon as needed  
**Evidence baseline:** `origin/main` tip **`21aa0ba`**; live API **`9945b6f`** (GO-16); FE **`b9bb175`**

## Instruction for Claude coder

Verify each row **Status** against `origin/main` (PR merge / file exists / Chrome). Reply with **CONFIRM** / **DISPUTE** / **UNKNOWN** per numbered item; do not invent new queue; do not mark green without evidence.

---

## Standing laws (L1–L5 / numbered 1–5)

1. **USMCA only / never seat POST Book Load** | Jorge types first load #; seats never create prod loads/money fixtures | **CLOSED law** | All | `PROJECT-INSTRUCTIONS-2026-09-02.md`, every INBOX
2. **Parallel books / cutover $0 OB** | USMCA TMS-authoritative; opening balances **$0**; categorize Dec 2025→ forward | **CLOSED** | Owner decided | `GO-19-OWNER-DECISIONS-CLOSED` · #19495 stub
3. **Capitalize $7,000 (never $7,500)** | WO AP must call `capitalize-threshold.ts` | **BUILT** | CC-1 | #19510 · `894c9d19`
4. **Rules diet / no sweep queue** | Only `00-IH35-LAW.mdc` + `03-display-ids.mdc` always-apply; queue = `INBOX-<SEAT>.md` not GUARD-WORKORDERS | **BUILT** | Cursor | #19524 · #19531
5. **FAST-MERGE / deploy batch** | Gate exit 0; batch 5–10 merges; never per-merge deploy; never `gh pr checks --watch` | **ONGOING** | Cursor lead | `OUTBOX-CURSOR.md`

---

## Book Load / load # / combobox (6–15)

6. **Plain digit load number** | Drop `L-YYYYMMDD-`; full-string digits; guard no last-4 regex | **BUILT** | CC-2/Cursor | #19325 · #19336 · #19341 · #19455
7. **First load # Jorge-typed** | `first_load_number_required` until Jorge seeds; not “broken” | **BUILT** | Cursor | #19336 · chat Sep 1 ~3:03 PM
8. **Child numbers follow load** | Expense seq1 = bare load #; driver bill = load #; no `B-` prefix | **PARTIAL** | CC-1 | Expense #19335 **BUILT**; driver bill `B-` removal **UNKNOWN** on tip
9. **Book Load never seat POST** | All testing = Jorge Chrome; Cancel-only for seats | **CLOSED law** | All | Every INBOX · GO-19-OWNER-DECISIONS §8
10. **Combobox / picker dismiss (K2)** | 268 files: EntityPicker/SelectCombobox don’t dismiss on outside mousedown; converge on `Combobox.tsx` handler | **PENDING** | CC-2 | `PASTE-ALL-SEATS-GO-21-GO-22` L72–74 · J1 worklist
11. **CarrierSwitcher “Make default” silent no-op** | API failure must toast, not silent | **BUILT** | Cursor | #19461 merged
12. **Book Load customer cap (A2)** | Server type-ahead over ~2,700 customers; no 200/500 cap | **BUILT** | CC-3 | #19594 · #19645 (300 clamp)
13. **GO-16 Rev B miles** | Lane table + Practical/Short/Thin/Check ZIP/Operator entered; autofill when stored miles exist | **BUILT** | Cursor | #19389 · #19424 · **#19689** @ `9945b6fc` · live API `9945b6f`
14. **GO-17 load-save proof panel** | Created / Linked / Ledger / DID NOT on same modal | **BUILT (code)** | Cursor | #19428 @ `12bfbd6` · **Chrome E2E Jorge pending**
15. **Check ZIP Option 1** | Autofill from `mdata.load_stops.postal_code`; boxes stay empty | **BUILT** | CC-3 | #19419 · #19414 seed 63/63
16. **City alias 63/63** | MERGE decisions applied to lane-mileage seed | **BUILT** | CC-3/CC-1 | #19414 · OUTBOX-CC-3

---

## GO-18 Load Costs (16–20)

17. **GO-18 design + map** | 13th tab “Costs”; Costs Board; same posters; no parallel ledger | **BUILT (docs)** | Cursor/Cascade | #19439 · #19446 · `GO-18-LOAD-COSTS-DESIGN.md`
18. **Bill driver/trailer + bill_lines.load_required** | Parity with expenses for 30-day road repair scenario | **BUILT** | CC-1 | #19459
19. **Load Costs tab + Board FE** | Codex mounts 13th tab + dispatch Costs Board | **PENDING** | Codex | Design only; no Costs-tab FE PR verified
20. **N1 from load (expense/bill/pay)** | Add expense + bill + Pay from load detail | **BUILT (code)** | CC-1/CC-2 | #19641 · #19676 · **Chrome 13508 pending**
21. **Vendor bill two boxes** | Vendor invoice # never auto-filled from load # | **BUILT** | CC-2 | #19329

---

## GO-19 queue (21–39)

22. **01 Plain load number** | See #6 | **BUILT** | CC-2 | #19325
23. **02 Clean slate bank fixtures** | `is_sample_data` on 34 fake bank rows; 381 real shown | **PARTIAL** | CC-1 | GO-11 purge ACK #19339; CC-1 INBOX still “kill sample drivers” · purge batches 3–5 **PENDING**
24. **03 Child numbers** | See #8 | **PARTIAL** | CC-1 | #19335
25. **04 Proforma at pickup** | Remove mint from book-load; mint on first pickup complete | **PENDING** | Cursor | `book-load.service.ts` still has ND-INV-01 at book (~L1938)
26. **05 Bill driver/trailer** | See #18 | **BUILT** | Cursor/CC-1 | #19459
27. **06 Bill line load_required** | See #18 | **BUILT** | CC-1 | #19459
28. **07 Load Costs board** | See #19 | **PENDING** | Codex | GO-19-07
29. **08 Future-dated bank txns (28)** | List, correct, import guard | **PENDING** | CC-3 | GO-19-08 in queue
30. **09 Expense class_id** | Parity with bills | **BUILT** | CC-3 | OUTBOX-CC-3 #19520
31. **10 Proof trail (GO-17 chain)** | Click → full F+R chain on every money doc | **PARTIAL** | CC-2 | Load-save panel #19428; full expense/bill/settlement chain **PENDING**
32. **11 Thirteen half-built** | Build or honest-null; no silent empty | **SUPERSEDED → GO-20** | Split | `GO-20-EIGHT-FEATURES.txt`
33. **12 Deep links (437 screens)** | Add routes to manifest | **PENDING** | Codex | GO-19-12 parallel
34. **13 Health-deep never passes** | Fix or delete dead checks | **BLOCKED/HOLD** | Cascade | `health-deep.routes.ts` still present; GO-20 says **do not build 12+13**
35. **14 Static verifier dead port** | Unset DATABASE_URL sentinel | **BUILT** | Cascade/Cursor | #19428
36. **15 Posting contract Event 2** | Contract matches two-event revrec | **BUILT** | CC-1 | #19337
37. **16 Bank categorize (407)** | Owner categorizes; suggest never auto-post | **PENDING** | CC-3 + Jorge | #19386 ranked queue; owner GL decisions
38. **17 Capitalize $7k wire** | See L3 | **BUILT** | CC-1 | #19510
39. **18 Today's Attention N-of-10** | 425C correct table + panel shows N/10 + logged skips | **PARTIAL** | CC-2 | #19471 425C **BUILT** · #19503 N-of-10 panel **BUILT** · live “6 dead sources” until GO-20 slices land
40. **19 Accessorials parent 4200** | parent_id 4210–4240 → 4200 | **BUILT** | CC-3 | #19494 · #19501
41. **20 Company settlement 5753** | Period grain, many loads, P&L **$2,415.11** | **BUILT (code)** | CC-1/Cursor | #19489 · OUTBOX-CC-1 live-Chrome empty (0 settlements expected)

**Owner decisions (closed — not re-ask):** cutover $0 · 5753 grain · accessorials 4200 · capitalize $7k · escrow wiped · insurance samples reconciled · Book Load Jorge-only (`GO-19-OWNER-DECISIONS-CLOSED-2026-09-01.md`).

---

## GO-20 eight features (40–51)

42. **A — Bank drift alerts** | Table + detector + Banking Drift panel | **BUILT (code)** | CC-1 | #19545 backend · #19560 screen · **Live Chrome UNVERIFIED**
43. **B — Predictive maintenance alerts** | On brake/tire projections; At Risk panel | **BUILT (code)** | CC-3 | #19541 · migration `202613410001` · **Live alert UNVERIFIED**
44. **C — Accident liabilities** | Table + owner decide + pending deduction; fix null liability id | **BUILT (code)** | CC-1 | #19523 · #19515 claim · `accident-liabilities.service.ts` · **Safety UI Chrome pending**
45. **D — Cargo sensor incidents** | Group `out_of_range` readings; dispatch schema | **BUILT (code)** | Codex/CC-1 | #19499 · #19502 · #19518 · migration `202613390002`
46. **E — Workers comp claims** | Injury must create claim or fail loud; safety home count | **PENDING** | Cursor | **No `workers_comp_claims` migration on main**
47. **F — WO parts (no inventory.parts)** | Repoint to `maintenance.parts_inventory`; TwoSectionLineEditor reads `sources.*.status` | **BUILT** | CC-1/Cursor | #19508
48. **G — WO labor rates (no maintenance.labor_rates table)** | Repoint to `catalogs.labor_rates`; same status latch | **BUILT** | CC-1/Cursor | #19508
49. **H — Late arrival + retention honesty** | `dispatch.late_arrival_aggregates`; score lists `features_missing` | **BUILT (code)** | Codex/CC-1 | #19516 · #19519 · migration `202613390003` · **Retention dashboard Chrome pending**
50. **5 — Cooling customers** | **DEFER launch** — must report UNAVAILABLE | **DEFER/UNAVAILABLE** | CC-2 | GO-20 law · CC-2 queue item 3
51. **8 — Recommended fuel stops** | **DEFER launch** — must report UNAVAILABLE | **DEFER/UNAVAILABLE** | CC-2 | GO-20 law · CC-2 queue item 3
52. **12+13 — QBO/bank feed health-deep** | **BLOCK: do not build**; delete `health-deep.routes.ts` + repoint monitor | **HOLD** | Cascade | File still on main; GO-20 BLOCKED section
53. **GO-20 bus FORCE** | Seven-seat INBOX/QUEUE/FEED rewrite | **BUILT** | Cursor | #19483 · #19504

---

## Pre-settlement / settlement (52–57)

54. **Pre-settlement query + link** | Wire `presettlement_link_id`; remove book-load TODO skip | **PARTIAL** | CC-1 | #19573 PS2/PS3 service · **manual attach/detach/close PENDING**
55. **GO-22 tour close law** | Home=23918 Mines Rd Laredo; close when in geofence + no load; loan blocking pop-up; fuel never driver deduction | **PENDING** | CC-1 | `INBOX-CC-1.md` Jorge 17:20Z · FINDINGs #19703 B6 conflict · #19708 B7
56. **Settlement display number** | Reuse `LD`/`LOAD` counter — never third type | **PARTIAL** | CC-1 | #19573 (fixed SETTLEMENT doc_type mistake)
57. **Pre-settlement / settlement UI (PS4/PS5)** | Recommend TR/SB + manual add/remove | **PENDING** | CC-3 | After GO-22 API on main
58. **Driver settlement dual-approval fix** | `status=approved` vs `needs_review` contradiction | **BUILT** | CC-1 | #19291 era · Neon 0 dual rows reported
59. **Company settlement 5753 view** | Reports trip-profitability / Company Settlements page | **BUILT (code)** | CC-1 | #19489 · empty live expected

---

## GO-21/22/23/24 (58–67)

60. **GO-21 register (49 defects)** | J1 typography ratchet; A2 customer; wizard B-rows; boards | **IN PROGRESS** | CC-2/CC-3 | `claude/GO-21-DISPATCH-DEFECT-REGISTER-2026-09-02.md`
61. **J1 design-system ratchet** | ~1083 off-scale → 0; guard required | **PENDING** | CC-2 | STATUS-NOW ~1015 off-scale · #19691 Chrome verify
62. **GO-24 locations picker + B2/B3/B4/B7** | `mdata.locations`; geocode gate; layout fixes | **BUILT** | CC-3 | #19661 · #19666 supersede 0251
63. **A1 trailer interchange** | Our unit XOR interchange; never broker in `mdata.units` | **BUILT** | CC-1/CC-3 | #19567 · #19609 · #19612 verify
64. **C1 raw UUID sweep** | Plain-English labels on operator surfaces | **PENDING** | CC-3 | INBOX-CC-3 · Cascade #19681 recount
65. **GO-22 B5 pay from profile** | Rate from driver profile; logged override only | **BUILT** | CC-1 | #19699
66. **GO-22 B7 loan recovery at close** | Blocking pop-up; registered decision | **BUILT** | CC-1 | #19708
67. **GO-22 void register chain** | 7-table void + reversing JE link | **BUILT** | CC-1 | #19694
68. **GO-25 archive dead lockdown** | git mv only | **BUILT** | Cursor | #19655
69. **Chrome prove load 13508** | Miles labels → Operator entered → expense/bill/pay → assign → pre-settlement | **PENDING** | CC-2 | `NOW-ONE-SOURCE.md` done bar · miles FIXED per #19696

---

## Silent no-ops / misc (68–79)

70. **Legal batch Download silent no-op** | Surface API failure | **BUILT** | Cursor | #19464
71. **UploadZone delete silent no-op** | Toast on delete failure | **BUILT** | Cursor | #19465
72. **Mark Disbursed silent no-op** | Disable when disbursed/reversed | **BUILT** | Cursor | #19433
73. **ConfirmModal insurance silent no-op** | catch + error display | **BUILT** | Cursor | #19330
74. **Portal download / earnings refresh / CBP widget** | 3 unique silent no-ops | **FINDING OPEN** | Cascade | **#19681 OPEN** (not merged)
75. **TwoSectionLineEditor / wo-cost-context** | Unavailable ≠ empty list | **BUILT** | CC-3/Cursor | #19508
76. **CostBreakdownBox** | Honest sources status | **UNKNOWN** | — | Mentioned in GO-20 D transcript; no merge PR verified
77. **Retention dashboard late-arrival factor** | Show factor or name missing input | **PARTIAL** | Codex | #19519 backend · FE honesty **Chrome pending**
78. **Fuel planner UNAVAILABLE standard** | null not zero; label unavailable | **DEFER #8** | CC-2 | GO-20 deferred slice 8
79. **Deploy parity** | API `9945b6f` vs tip `21aa0ba` | **PENDING** | Cursor | `INBOX-CURSOR` · batch deploy
80. **Devin-A retired** | No POST; Chrome = CC-2 | **VOID seat** | — | `INBOX-DEVIN-A.md`
81. **Escrow $500.01 WORM reverse** | Mark + reverse, not delete | **PARTIAL** | CC-1 | #19485 **OPEN** (docs board)
82. **NO-SEAT prod financial guard in CI** | Workflow names guard | **BUILT** | CC-2/Cursor | #19273 family
83. **A3/B12 Book Load invalid-stop banner** | Codex closed | **BUILT** | Codex | `INBOX-CODEX` DONE
84. **Codex Driver Inbox #19657** | Red — leave off queue | **VOID/CLOSED** | — | #19657 CLOSED

---

## Working sequence NOW→next table

Per `NOW-ONE-SOURCE.md` + seat INBOXes (**2026-09-02 17:35Z**). **UNAVAILABLE/HOLD** marked.

| Order | Seat | **NOW** | **Then** | **Then** | Notes |
|-------|------|---------|----------|----------|-------|
| 1 | **CC-1** | **GO-22** pre-settlement + settlement (tour close law) | Kill 2 sample drivers | GO-20 tail / purge batches 3–5 | **Never POST** · N1 **DONE** (#19641/#19676) |
| 2 | **CC-2** | **Chrome load 13508** (FIXED/NOT FIXED + SHA) | **J1** ratchet → 0 off-scale | **K2** combobox dismiss (268 files) | HOLD lifted on J1 per OUTBOX |
| 3 | **CC-3** | **C1** UUID sweep (after Cascade count) | Help CC-2 J1 off-scale if count late | — | GO-24 **DONE** · Not N1 · Not miles |
| 4 | **Codex** | Next **GO-23** row (not miles/N1/GO-22/C1) | GO-18 Costs FE when authorized | Deep links 437 | Scoreboard freshness → ping Cursor |
| 5 | **Cascade** | **C1 recount** for CC-3 + specs-vs-live FINDINGs | — | — | **NEVER BUILD** · #19681 open |
| 6 | **Cursor** | **Lead only**: deploy parity · bus fan-out · FAST-MERGE green PRs | Scoreboard regen if 48h gate red | — | **NOT GO-22** · **NOT cc1/go22-*** branch |

---

## HOLD/UNAVAILABLE

- **GO-20 slices 12+13** — health-deep delete (Cascade HOLD)
- **GO-20 slices 5+8** — cooling customers / fuel stops (DEFER → UNAVAILABLE reporting, CC-2)
- **GO-19 slice 04** proforma-at-pickup — Cursor lane when CC-1 money serial free
- **GO-20 slice E** workers comp — Cursor; **no table yet**
- **#19657** Codex Driver Inbox — off queue
- **#19485** escrow board docs — open, not blocking GO-22

**Superseded — do not remake:** GO-16 (#19689) · N1 (#19641/#19660/#19676) · GO-24 (#19661) · A3/B12 · B2/B7/geocode · accessorials · capitalize · 5753 report (#19489).

---

## Critical path note

Most **accounting spine + GO-20 backend** items from Sep 1–2 have merge evidence on `main`. The active critical path is **CC-1 GO-22 settlement tour law**, **CC-2 Chrome 13508 + J1/K2**, and **Jorge’s first real Book Load click** — nothing is end-to-end proven until that Chrome bar clears. Seats still **never POST Book Load**.

---

## Gaps / unclear section

| Item | Status | What to verify |
|------|--------|----------------|
| **Jorge Book Load E2E** | **UNKNOWN** | First digit load booked in Chrome after #19689 deploy; pre-settlement appears |
| **Driver bill number = load # (no B-)** | **UNKNOWN** | Grep `driver-bill-number.ts` on `origin/main` |
| **GO-18 Costs 13th tab FE** | **UNKNOWN** | Codex branch / open PR |
| **GO-19-02 bank fixture purge on Neon** | **PARTIAL** | CC-1 purge batches 3–5 counts |
| **GO-20 E workers comp** | **PENDING** | No `safety.workers_comp_claims` migration |
| **GO-19-04 proforma at pickup** | **PENDING** | `book-load.service.ts` still mints at book |
| **Attention panel 10/10 live** | **PARTIAL** | After deploy: count working sources vs dead (was 3/10 post-#19471) |
| **Accident liability Safety UI** | **UNKNOWN** | Chrome: file accident → awaiting decision panel |
| **GO-22 PS4/PS5 UI** | **PENDING** | CC-3 after API stable |
| **Combobox K2 completion** | **PENDING** | `trapping_picker_total = 0` guard |
| **health-deep.routes.ts removed** | **NOT DONE** | Cascade HOLD 12+13 |
| **Deferred 5+8 UNAVAILABLE chrome** | **UNKNOWN** | CC-2 audit per GO-20 |
| **CostBreakdownBox status latch** | **UNKNOWN** | Separate from TwoSectionLineEditor #19508 |
| **Live API = tip `21aa0ba`** | **PARTIAL** | API `9945b6f` lags tip; Cursor batch deploy |
| **#19681 three silent no-ops** | **OPEN PR** | Portal download / earnings / CBP widget |

---

## Claude confirm reply template

Reply with one row per numbered item (1–84). Do not invent new queue items.

| # | CONFIRM / DISPUTE / UNKNOWN | note | evidence SHA/PR |
|---|----------------------------|------|-----------------|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
| 6 | | | |
| 7 | | | |
| 8 | | | |
| 9 | | | |
| 10 | | | |
| 11 | | | |
| 12 | | | |
| 13 | | | |
| 14 | | | |
| 15 | | | |
| 16 | | | |
| 17 | | | |
| 18 | | | |
| 19 | | | |
| 20 | | | |
| 21 | | | |
| 22 | | | |
| 23 | | | |
| 24 | | | |
| 25 | | | |
| 26 | | | |
| 27 | | | |
| 28 | | | |
| 29 | | | |
| 30 | | | |
| 31 | | | |
| 32 | | | |
| 33 | | | |
| 34 | | | |
| 35 | | | |
| 36 | | | |
| 37 | | | |
| 38 | | | |
| 39 | | | |
| 40 | | | |
| 41 | | | |
| 42 | | | |
| 43 | | | |
| 44 | | | |
| 45 | | | |
| 46 | | | |
| 47 | | | |
| 48 | | | |
| 49 | | | |
| 50 | | | |
| 51 | | | |
| 52 | | | |
| 53 | | | |
| 54 | | | |
| 55 | | | |
| 56 | | | |
| 57 | | | |
| 58 | | | |
| 59 | | | |
| 60 | | | |
| 61 | | | |
| 62 | | | |
| 63 | | | |
| 64 | | | |
| 65 | | | |
| 66 | | | |
| 67 | | | |
| 68 | | | |
| 69 | | | |
| 70 | | | |
| 71 | | | |
| 72 | | | |
| 73 | | | |
| 74 | | | |
| 75 | | | |
| 76 | | | |
| 77 | | | |
| 78 | | | |
| 79 | | | |
| 80 | | | |
| 81 | | | |
| 82 | | | |
| 83 | | | |
| 84 | | | |

**Reply header (required):** `CLAUDE-CONFIRM | origin/main SHA=<tip> | API=<healthz version> | FE=<version.json> | date=<UTC>`
