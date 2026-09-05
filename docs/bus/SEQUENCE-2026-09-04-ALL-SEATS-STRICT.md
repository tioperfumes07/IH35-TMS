# SEQUENCE LAW 2026-09-04 — ALL SEATS · STRICT ORDER

**Status:** BINDING. Owner: *"Make sure all coders work in order. I do not want them disregarding or jumping or forgetting any instruction."*

**Supersedes** every stacked INBOX wake above your seat’s SEQUENCE card. Older wakes are history, not a menu.

---

## GLOBAL RULES (every seat)

1. **§0 FINISH LAW.** The step you are on finishes (merge + guard + OUTBOX proof) before you start the next number. No parallel “while I wait” on a later step in your own list.
2. **No jumping.** You may not start step N+1 because step N is hard. Stop, report the refusal, fix or escalate on the bus — then continue.
3. **No forgetting.** Every numbered step stays on your list until OUTBOX shows `STEP-N DONE | <sha-or-proof>`.
4. **OUTBOX checkoff required.** After each step: one line `SEAT | STEP-N DONE | <proof> | NEXT STEP-N+1`. Lead treats a missing checkoff as idle.
5. **One surface.** Outside your lane: one line to the owning seat’s OUTBOX, then back to your step. Do not fix their code.
6. **USMCA only.** `is_sample_data=false`. Never POST Book Load as a probe. Only Cursor deploys.
7. **Pull tip first.** `git pull --ff-only origin main` every session. Law files beat memory.

**Cross-seat gates (do not violate):**

| Gate | Until | Who is blocked |
|---|---|---|
| CC-3 geofence import complete | addresses counted + projected + guards green | CC-1 must not invent actual driven miles; Cursor must not wire Book Load→Samsara |
| CC-1 ITEM ZERO green | CostOfGoodsSold picker + fuel ROLE | CC-1 must not enter diesel rows on the feed |
| Owner closes pre-settlements | he says so | **Nobody** closes a pre-settlement |

---

## CC-3 — STRICT SEQUENCE

**Laws:** `ORDER-2026-09-04-CC-3-SAMSARA-GEOFENCE-IMPORT.md` · `CONTRACT-2026-09-04-BOOKLOAD-SAMSARA-PUSHBACK.md` · telematics leftovers in that ORDER.

| Step | Do | Done when |
|---|---|---|
| **3.0** | ACK this sequence | OUTBOX ACK line |
| **3.1** | Add `addresses` to Samsara remote-count collector; run both live entities | **One-line count** posted |
| **3.2** | Create `integrations.samsara_addresses` (idempotent on `samsara_address_id`) | Migration on tip + guard |
| **3.3** | Import **ALL** addresses (junk included); project `mdata.locations` + `geo.geofences`; circles→polygons keep radius; source+samsara id forever | Counts: imported / matched / ambiguous |
| **3.4** | Match proximity **AND** name only — never auto-merge on name guess; file collisions for owner | Collision report on OUTBOX |
| **3.5** | Guards: idempotent sync · geofence carries samsara source id · no geofence around unresolved point | Three guards green |
| **3.6** | ACK Book Load→Samsara push-back contract | OUTBOX contract ACK |
| **3.7** | Telematics defect 1: `vehicle_latest_position` two rows/unit | Fixed + guard |
| **3.8** | Telematics defect 2: city/state/formatted_location NULL today | Fixed + guard |
| **3.9** | Telematics defect 3: T144 silent since 2025-07-09 vs settlement 5760 | Diagnosed + fix or owner-filed |
| **3.10** | DRV-03 DQF checklist vertical | Done bar in ORDER |
| **3.11** | Hand `driver_samsara_links` migration to CC-1 once; keep building FE | OUTBOX handoff line |
| **3.12** | Accident-liabilities VOID — FE caller | Operator can void |

**Forbidden:** settlement writes `5753`/`5760`–`5795`; deleting geofences; auto-merge on city name; starting 3.7 before 3.6.

---

## CC-1 — STRICT SEQUENCE

**Laws:** `ORDER-2026-09-04-SETTLEMENT-ENTRY-SPLIT.md` · `ORDER-2026-09-04-CC-1-THREE-MILE-CPM.md` · packets in `settlement-entry-2026-09-04/` · ALL-SEATS CC-1 load-costs vertical still binds for costs UI.

| Step | Do | Done when |
|---|---|---|
| **1.0** | ACK this sequence | OUTBOX ACK |
| **1.1** | **ITEM ZERO** — CostOfGoodsSold type match + fuel account by ROLE (not name) | Diesel picker shows fuel; guard green |
| **1.2** | Settlement feed masters (match only, no dupes; Simple/Simplex/Silo stay 3) | Masters matched report |
| **1.3** | Loads + stops for your 31 (all COMPLETE; addresses only) | 66 loads; stop at first refusal |
| **1.4** | Customer invoices (line haul at settlement rates) | Foot to packet |
| **1.5** | Expenses/bills — every diesel + paired DEF + other; real invoice #s | 180 diesel path unblocked by 1.1 |
| **1.6** | Driver bills (loaded + deadhead; flat override = say if missing) | |
| **1.7** | Additional pay / reimbursements / deductions / escrow **$25/load** | |
| **1.8** | Pre-settlement per tour — **STOP. NEVER CLOSE.** | **31 OPEN · 0 closed · 0 close JEs** |
| **1.9** | Three-mile schema: `miles_driven_actual` on load + leg + source/reason | Migration; NULL never 0 |
| **1.10** | Guards: three bases separate · CPM states basis · actual null-with-reason | Green |
| **1.11** | **WAIT FOR CC-3 step 3.5+** then wire actual miles from geofence enter/exit | No invention |
| **1.12** | CPM + MPG report — three bases labelled | Owner can read basis on every figure |
| **1.13** | Finish remaining ALL-SEATS load-costs board/settlement UI items not yet done | Per ALL-SEATS done bar |

**Forbidden:** close pre-settlements; touch `5766/5772/5776/5780/5783/5784`; type settlement miles; invent payments; derive actual from practical/short; start 1.11 before CC-3 geofences.

**5789:** load `2026-08-29` + memo (only authorized date fix).

---

## CC-2 — STRICT SEQUENCE

**Law:** `ORDER-2026-09-04-ALL-SEATS.md` CC-2 section.

| Step | Do |
|---|---|
| **2.0** | ACK |
| **2.1** | Land design tokens (`--th-bg` etc.) in `tokens.ts` — **FIRST**; ratchet guard fails if navy header returns |
| **2.2** | Dispatch surfaces read tokens (one guarded sweep) |
| **2.3** | System-wide token adoption on your money surfaces |
| **2.4+** | Money defects ACC-01..18, ACC-20 — **one complete vertical at a time**, in number order |

**Forbidden:** settlement feed; geofence import; hard-coded colours after 2.1.

---

## CODEX — STRICT SEQUENCE

**Law:** ALL-SEATS Codex section.

| Step | Do |
|---|---|
| **X.0** | ACK |
| **X.1** | Report USMCA units held in open maintenance (count + unit #s) — ask owner before closing any |
| **X.2** | In-shop feed endpoint for Cursor (shape on OUTBOX the minute it merges) |
| **X.3** | Awaiting-assignment carries unit number |
| **X.4** | Fleet queue **in order:** FLT-01 → FLT-02 → FLT-04 → FLT-10 |
| **X.5** | Border contract to Cursor (one endpoint; do not fork `loadHasCrossBorder`) |

**Forbidden:** deploy; settlement/geo; delete archived list files.

---

## CASCADE — STRICT SEQUENCE

**Law:** ALL-SEATS Cascade section.

| Step | Do |
|---|---|
| **K.0** | ACK |
| **K.1** | PR1 — wire planner bars from real loads (no `bars: []`) |
| **K.2** | PR2 — grid UX (outlines, kill overlays, scroll, day re-fit) |
| **K.3** | PR3 — design law on your surface (read CC-2 tokens) |
| **K.4+** | Lists/reports BRD-01..24 one PR each |

**Forbidden:** findings-only mode; DispatchBoard/Kanban/BookLoad; fixing CC-1 voided-bill sum (file one line); idle; local-only commits.

---

## CURSOR — STRICT SEQUENCE

**Laws:** ALL-SEATS Cursor · settlement control 6 · push-back contract · lead.

| Step | Do |
|---|---|
| **C.0** | ACK this sequence; confirm other seats ACK within one tick |
| **C.1** | ACK Book Load→Samsara contract — **do not build yet** |
| **C.2** | Lead census each tick: who is on which step; re-wake idle |
| **C.3** | If CC-1 blocked >15m on ITEM ZERO or tour-close — you fix |
| **C.4** | ITEM ZERO-B tour-close = Laredo delivery **OR** yard — before owner closes any pre-settlement |
| **C.5** | Control group hand-entry `5766/5772/5776/5780/5783/5784` when you take them (after CC-1 feed progressing) |
| **C.6** | **After CC-3 3.6:** wire Book Load → Samsara push-back |
| **C.7** | Deploy every 5–10 merges; finish dispatch cleanliness from ALL-SEATS |

**Forbidden:** closing pre-settlements; building Samsara import; pinging Jorge for clock.

---

## LEAD ENFORCEMENT

- STATUS-NOW lists each seat’s **current step number**.
- A seat posting work on a later step without `STEP-N DONE` is out of order — lead posts `ORDER VIOLATION` and they revert to N.
- Dependencies in the gate table above are hard stops.
