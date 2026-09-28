# CORRECTION — ROUND 144's 5819 driver is WRONG per the actual signed PDF — HOLD on 5817/5818/5819 — CC-1 — 2026-09-27 10:15 PM CT (03:15Z 09-28).
Prior content archived: `docs/bus/archive/NOW-CC-1-2026-09-28-02.md` (WORM).

CC-1 | ROUND 144 item 2/3 (5819 restore, 5817/5818 create) | BLOCKED — order's premise is wrong,
verified against the primary document, not the ruling's summary of it.

**`~/Downloads/09-28-2026-Claude-Lead-RULING-QBO-5819-QUICKPAY.md` says Driver_Settlement_5819's
driver is Leonel Antonio Morales Noguez. I opened the actual PDF myself
(`~/Downloads/Driver_Settlement_5819.pdf`) — it says `Neftali Coronado Urbano`.** Pasted verbatim
from the PDF text extraction:
```
Driver Settlement No. 5819
IH35 Transportation, LLC                    Neftali Coronado Urbano
Start Date: 2026-09-18   End Date: 2026-09-25
Load 13612 ... Load 13617 ...
```
`Company_Settlement_5819.pdf` confirms the same: every stop line for 13612 and 13617 is tagged
`Neftali Coronado Urbano`. The voided app row (`driver_finance.driver_settlements` id
`c50e6c82-efff-4432-a1f5-b1e7edc42dd0`, display_id `5819`, driver_id `ac9ea24d...` = Leonel) has the
**wrong driver** — that's a real defect in the voided row itself, separate from whether voiding it
was right or wrong.

**And the app already has the correct version, live, right now — it was never actually missing:**
```
settlement id                          display_id  driver               loads         status
8fefac42-b60b-443e-9ceb-1e7b9350d696   P-0002      Neftali Coronado      13612,13617   open
2ef96b64-c4bf-4f4e-8bd6-45cf0d8e8224   P-0004      Ruben Pedro Perez     13609,13614   open
b69dfafb-7287-42f6-b46b-19257c9e7095   (unlabeled) Genaro Guerrero       13610,13619   open
```
Cross-checked `Driver_Settlement_5817.pdf` (Genaro Guerrero Chavez, 13610+13619) and
`Driver_Settlement_5818.pdf` (Ruben Pedro Perez Garcia, 13609+13614) — **both drivers and both load
pairs match the app's existing open pre-settlements exactly.** These three settlements are not
missing; they exist under system-minted numbers (P-0002, P-0004, and one unlabeled), not yet
reconciled to their real AlwaysTrack docrefs (5819, 5818, 5817) or trued up to the signed dollar
figures (Invoiced/Quick Pay/Driver Salary/Fuel/Company Expenses/Net Revenue).

**NOT doing what the order says (restore/create with Leonel as 5819's driver) — that would put two
real loads under the wrong driver, sourced from a ruling that itself didn't check the primary PDF.**
The correct action is almost certainly: rename/relabel these three existing pre-settlements to their
real docrefs and true up their line amounts to the signed PDFs — not create new rows or un-void the
wrong-driver row. Also note: this directly overlaps ROUND 143 STEP 5/AUTH-073 — load 13617 is one of
the "6 ROUND 189 loads" that fix is trying to make visible on the Dispatch board again, and it lives
in P-0002, the very settlement this finding is about.

`accounting.company_settlements` has no row for 5817/5818/5819 yet (checked live) — that side may
still be genuinely missing, separate from the driver-side settlements above.

Holding for a corrected order before touching any of 5817/5818/5819 or their loads/bills.

## Still open
STEP 5 (views.live_loads second exclusion clause, needs new AUTH) · G4 Sch Fee GL · G3a · ROUND 202
STEP 3 (5812 header close) · 13619 customer/WO mismatch · 18 unmatched cleared checks ($19,329.95) ·
5814 $100 variance · 3 short-pays ($3,750 → 4970) · role bindings (172 dup account numbers) · A/P
adoption (47 payrun_gl_runs).

CC-1 | 03:15Z | Moving to the 18 unmatched cleared checks ($19,329.95) while this is pending a call.
