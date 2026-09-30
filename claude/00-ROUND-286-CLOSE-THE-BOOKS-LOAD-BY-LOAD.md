# ROUND 286 — CLOSE THE BOOKS. LOAD BY LOAD, MEASURED IN THE APP'S OWN TABLES.
# Claude Lead · 09-30-2026 · Owner: *"verify all loads have their real invoices, real expenses, that we
# do not have an unvoided load, or that we are not missing any."*
# Every number below is live from br-fancy-credit-akjnd07a under
# SET LOCAL ROLE neondb_owner; SET LOCAL app.bypass_rls='lucia'. USMCA only.

# THE SHORT ANSWER
**Revenue is complete except for 9 voided invoices worth $32,750.00 that were never reissued.**
**No load is voided. No load is double-invoiced. Cancelled loads correctly carry nothing.**
**The cost side has 4 revenue loads with no driver pay and 18 with no expense at all.**
That is the whole gap. Everything else ties.

---

## 286.A — REVENUE COMPLETENESS, all 150 loads
| status | loads | no live invoice | double-invoiced | invoiced | paid | load voided |
|---|---|---|---|---|---|---|
| closed | 86 | **0** | 0 | $301,262.00 | $12,475.00 | 0 |
| invoiced | 23 | **0** | 0 | $80,454.72 | $3,032.60 | 0 |
| dispatched | 14 | **0** | 0 | $61,375.00 | $0.00 | 0 |
| cancelled | 14 | 14 (correct) | 0 | $0.00 | $0.00 | 0 |
| completed_docs_received | 13 | **8** | 0 | $23,210.00 | $0.00 | 0 |

- **`mdata.loads.voided_at` is NOT NULL on ZERO loads.** There is no unvoided-load defect and no voided
  load hiding revenue. `load: { supported: false }` in the void engine is consistent with this.
- **No load carries more than one live invoice.** No double billing anywhere.
- **All 14 cancelled loads carry no invoice, no expense, no fuel and no driver bill.** Correct by design.
- Total live invoiced: **$466,301.72**. Total paid: **$15,507.60**. A/R 1100 reads **$336,809.12**.
- **All 14 dispatched loads already carry an invoice.** Confirm these are proformas — a proforma shows in
  cash flow and NOT in the books (owner law). If any of the 14 is a real posted invoice before delivery,
  that is revenue recognised early and CC-1 fixes it.

## 286.B — THE ONLY REVENUE GAP: 9 VOIDED INVOICES, $32,750.00, VOIDED AS "TRANSPORTATION"
Every one of the 8 unbilled `completed_docs_received` loads **has an invoice — it is voided**, and all nine
voided invoices on that status share ONE void reason, verbatim:

> `Transportation load — Faro Transportation portal (Aug reconciliation sheet 6, R-160)`

| load | W/O | rate |
|---|---|---|
| 13497 | AT-5773-13497 | $7,200.00 |
| 13502 | AT-5772-13502 | $3,800.00 |
| 13505 | AT-5776-13505 | $3,900.00 |
| 13506 | AT-5775-13506 | $3,900.00 |
| 13507 | AT-5772-13507 | $1,200.00 |
| 13522 | AT-5784-13522 | $3,500.00 |
| 13530 | AT-5780-13530 | $1,500.00 |
| 13531 | AT-5785-13531 | $4,300.00 |
| | **8 loads** | **$29,300.00** |
Voided invoice face on the status: **$32,750.00 across 9 invoices.** Each load has 2 documents attached.

**An earlier round voided these because it believed they were Transportation work.** The owner has now ruled
that Transportation is fully deleted. **Deleting the entity does not by itself convert a Transportation load
into USMCA revenue** — so this is the one question only the owner can answer, and it is worth $29,300.00:

> **OWNER QUESTION 286.1 — were loads 13497, 13502, 13505, 13506, 13507, 13522, 13530 and 13531 hauled
> for USMCA, or were they Transportation work?**
> **USMCA →** reissue the 9 invoices, revenue goes up $32,750.00, and they enter the Faro queue.
> **Transportation →** the loads leave USMCA the same way the rest of Transportation did, and revenue is
> already correct today.
**NOBODY TOUCHES THESE 9 UNTIL THE OWNER ANSWERS.** No reissue, no delete, no re-void, no guess.

## 286.C — COST COMPLETENESS. Real defects, on revenue-bearing loads only (86 + 23 + 13 = 122).
| status | loads | NO driver bill | NO expense | no fuel txn |
|---|---|---|---|---|
| closed | 86 | 0 | **5** | 40 |
| invoiced | 23 | **1** | **7** | 13 |
| completed_docs_received | 13 | **3** | **6** | 5 |
| **revenue loads total** | **122** | **4** | **18** | 58 |

**286.C.1 — CC-3 — 4 revenue loads have NO driver bill. Every load that moved paid a driver.**
1 invoiced + 3 completed_docs_received. Find them, find what the driver was owed from the settlement or the
rate sheet, and create the driver bill. PROOF: the 4 load numbers, the 4 driver bills, and this count at 0.

**286.C.2 — CC-1 — 18 revenue loads have NO expense of any kind.** A delivered load with zero cost makes its
margin 100% and every company-level margin wrong. Cross this against Codex's #36 — **424 expense lines with
no load, $23,400.01.** Those two findings are very likely the same lines seen from both ends: the cost exists,
it just is not linked to its load. **Link first, create only what is genuinely missing.**
PROOF: the 18 load numbers, how many were fixed by linking vs by creating, and this count at 0.

**286.C.3 — NOT a defect, do not "fix" it: 58 loads with no fuel transaction.** A load can legitimately run
on diesel bought on an earlier load. Fuel is not per-load mandatory. It affects per-load margin accuracy, not
correctness. **Nobody invents a fuel transaction to make a count go green.** Report it as an accuracy note.

## 286.D — CORRECTION TO ROUND 285 PART H. My PO backfill instruction was wrong.
Measured: **150 loads · 26 have a PO · 137 have a W/O · 119 have a W/O but no PO · 5 have NEITHER.**
The Faro/AlwaysTrack reference is `customer_wo_number` (e.g. `AT-5773-13497`) and it is populated on 137
of 150. So there is no 123-row PO backfill. **285.3.11 is REPLACED:**

**286.D.1 — CC-3 — 5 loads have no external reference at all — no PO and no W/O.** Those 5 cannot be joined
to Faro or AlwaysTrack by anything. Find them, get the reference from the rate confirmation, backfill it.
Where no document exists, leave it NULL and report it — an honest gap beats an invented number.

**286.D.2 — CC-1 — rule PO vs W/O once, in writing, and make every engine obey the ruling.**
Today the Faro join is documented as "PO = AlwaysTrack W/O" while the data keeps them in two columns with
different fill rates. That ambiguity is how 13581/13582 got swapped and Faro 059 got used twice. One
canonical column for the external reference, the other explicitly secondary. PROOF: the ruling, and every
join site updated to it.

## 286.E — WHAT TIES, and is not to be re-derived
- Every journal entry balances: **3,788 entries, 0 unbalanced, 0 zero-line, Dr = Cr = $3,240,860.36.**
- Void population: invoices, expenses and fuel **fully reversed**; fuel tied to **$177,665.44** exactly.
- **1090 Undeposited Funds $315,561.76** and **6300 $230.00** — both AUTH-136 targets hit exactly.
- `is_sample_data` in USMCA: **0**.
- The load count moved **149 → 150 during this session** — dispatch is live and writing while we close.
  **A close is a moment, not a state.** Every figure here carries today's date for that reason.

## 286.F — CODEX FINDING, and it is the most serious thing anyone reported this round
Codex: *"Found an existing gate that inserts cross-company fixtures before rolling back."*
**A test that writes fixtures into a real operating entity violates the law directly** — every USMCA record is
real unless `is_sample_data = true`, and nothing test, sample or demo is ever written into USMCA, *including
to prove a guard works*. A rollback is not a defence: the rows existed, sequences advanced, triggers fired,
and any concurrent read saw them. It is also cross-company, which is canonical guard **#17**.
**286.F.1 — CODEX — isolate that gate so it never touches a real entity, then prove the blast radius:**
`is_sample_data = true` count in USMCA (0 today — confirm it stayed 0), and no orphan rows from a rolled-back
fixture in any hub table. Your fail-closed protection was the right instinct. **Do not merge control 1 until
that gate is isolated** — registering a control whose own CI run contaminates production is worse than no
control. Your hold is correct and I am backing it.
