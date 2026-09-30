# ROUND 287 — THE USMCA BOUNDARY IS THE SETTLEMENT NUMBER. 8 INVOICES WERE VOIDED WRONGLY.
# Claude Lead · 09-30-2026 · Owner: "you drifted those are not the real numbers, not the real usmca numbers."
# Correct. I re-derived a number set instead of reading the closed reconciliation. Corrected below.

# 287.0 — LEAD RETRACTION. **OWNER QUESTION 286.1 IS WITHDRAWN. It was already answered.**
`00-CLOSED-USMCA-SETTLEMENTS-5769-TO-5819-TIE-EXACTLY-NEVER-ASK-AGAIN.md` states the boundary in writing:

> **USMCA's settlement series BEGINS AT 5769.** Anything below 5769 belongs to Transportation.
> *"Lead twice flagged these as a gap and twice asked the owner about them. Both times the answer was the
> same. Do not raise them again."*

I asked a third time. The document title says never ask. **Read the closed docs BEFORE measuring.**

## 287.1 — THE BOUNDARY, AND WHY MY ROUND 286 NUMBERS WERE WRONG
I used AlwaysTrack's pull window `13508-13621` as if it defined USMCA. **It does not. It is a pull window
from one export, not an ownership boundary.** The boundary is the settlement number in the W/O.

Measured live on the 150 USMCA-company loads, splitting on `split_part(customer_wo_number,'-',2)::int`:

| bucket | loads | cancelled | live invoiced | voided invoices |
|---|---|---|---|---|
| **settlement >= 5769 -> USMCA** | 20 | 0 | $41,910.00 | **$51,810.00** |
| **settlement < 5769 -> TRANSPORTATION** | 11 | **11** | - | $37,659.00 |
| no `AT-` settlement in W/O (real customer W/Os) | 119 | 3 | $424,391.72 | - |

**Transportation handling is already correct and closed:** all 11 sub-5769 loads are cancelled and every one
of their invoices is voided. That is Transportation being gone, exactly as the owner ruled. **Nobody touches
those 11, and nobody raises 5753 or 5760-5768 again.**

## 287.2 — THE REAL DEFECT: $29,300.00 of USMCA revenue is sitting voided as "Transportation"
13 invoices on loads whose settlement is **>= 5769 — USMCA by the closed boundary** — were voided with reason
`Transportation load - Faro Transportation portal (Aug reconciliation sheet 6, R-160)`.
**That void contradicts the owner's own closed boundary document.** 5 of the 13 were reissued and carry a live
invoice. **8 were not, and their revenue is simply absent from the books:**

| load | W/O | settlement | status | voided face | live invoice today |
|---|---|---|---|---|---|
| 13497 | AT-5773-13497 | 5773 | completed_docs_received | $7,200.00 | **none** |
| 13502 | AT-5772-13502 | 5772 | completed_docs_received | $3,800.00 | **none** |
| 13505 | AT-5776-13505 | 5776 | completed_docs_received | $3,900.00 | **none** |
| 13506 | AT-5775-13506 | 5775 | completed_docs_received | $3,900.00 | **none** |
| 13507 | AT-5772-13507 | 5772 | completed_docs_received | $1,200.00 | **none** |
| 13522 | AT-5784-13522 | 5784 | completed_docs_received | $3,500.00 | **none** |
| 13530 | AT-5780-13530 | 5780 | completed_docs_received | $1,500.00 | **none** |
| 13531 | AT-5785-13531 | 5785 | completed_docs_received | $4,300.00 | **none** |
| | | | | **$29,300.00** | |

Already reissued, correct, leave alone: 13503 (5770) · 13504 (5771) · 13509 (5770) · 13533 (5786) · 13539 (5788).

**Every one of the 8 settlements — 5772, 5773, 5775, 5776, 5780, 5784, 5785 — is inside 5769-5819**, the range
the closed doc proves ties to AlwaysTrack **51 of 51, variance 0**. The settlement is closed, signed and
tied. **The revenue behind it is not on the books.**

**287.2.1 — CC-1 — issue the 8 invoices. $29,300.00.**
- **Create the DOCUMENT.** Never un-void the old invoice, never a journal entry. The voided invoice stays
  voided with its reason preserved verbatim; the new invoice is the record going forward.
- **Delivery evidence exists and is named:** `mode='historical_backfill'`, and a **closed settlement IS
  delivery evidence** (standing law section 10). Each of the 8 has a closed signed settlement in 5769-5819
  plus 2 attached documents. Cite the settlement number per invoice.
- **Match key is the W/O, never the load number:** Faro `PO` -> `customer_wo_number`, then
  `customer_po_number`. Ruled in the closed reconciliation section 5; it supersedes anything I said earlier
  about "PO = W/O". **286.D.2 is CLOSED — already ruled, do not re-rule it.**
- **PROOF:** the 8 invoice numbers, 1100 A/R before and after, and the void reason still readable on each
  superseded invoice.

**287.2.2 — CC-1 — then fix the writer that did this.** One repair pass voided 13 USMCA invoices on a belief
about entity ownership. **Ownership is decided by the settlement number, >= 5769.** Any engine, script or
importer that classifies an entity by load number, by date, by null PO, or by a hand-kept list is wrong.
Find the one that stamped those 13 and make it read the settlement. PROOF: the file and line, and the rule
it now applies.

## 287.3 — LOADS MISSING FROM THE ALWAYSTRACK SET
Absent from `13508-13621` in the app: **13553, 13556, 13593.**
- **13556 is correctly absent** — the closed reconciliation section 4 rules it stays cancelled.
- **13593 MUST EXIST.** Closed reconciliation section 4: *"13593 IS UN-CANCELLED — invoice 074-13593,
  ALIGATOR, $4,800.00, 09/14/2026... Its driver bill and 4 fuel rows stay."* One of the five self-carried
  invoices. **287.3.1 — CC-1 — create load 13593 with invoice 074-13593 at $4,800.00, its driver bill and its
  4 fuel rows**, per the closed doc. PROOF: the load, the invoice, the driver bill, the 4 fuel rows.
- **13553 is unexplained. 287.3.2 — CC-3 — establish from AlwaysTrack's own export whether 13553 exists and
  whose it is.** If USMCA, feed it. If not, say so with the export named. Do not guess.

## 287.4 — THE CONTROLS I SHOULD HAVE MEASURED AGAINST. Nobody re-derives these.
From `00-USMCA-RECONCILIATION-CLOSED-NEVER-ASK-AGAIN.md`, proven across three or more independent sources:

| control | value |
|---|---|
| Faro purchases | **$311,587.00** |
| Faro A/R balance | **$298,762.00** |
| Debtor receipts | **$12,825.00** |
| Net advance | **$302,019.36** |
| Realized fees | **$4,902.04** (discount 4,673.82 + wire 220.00 + schedule 8.22) |
| Escrow reserve @ 9/21 | **$4,530.19** |
| Cash reserve control @ 9/21 | **$4,135.41** |
| Self-carried open balance | **$12,592.40** |
| AlwaysTrack charges / total | **$386,266.72 / $380,542.67** |
| AlwaysTrack fuel / driver pay | **$161,168.84 / $69,645.70** |

**THE IDENTITY THAT CLOSES THE BOOK: `311,587.00 - 12,825.00 = 298,762.00` — EXACT.**

**Any seat, Lead included, whose measurement disagrees with these does not have a finding — it has a bug,
until proven otherwise in writing with the source file named.** That is the closed doc's own rule and it is
the rule I broke this round.

## 287.5 — WHAT STANDS FROM ROUND 286, re-measured and unchanged
- **Zero loads carry `voided_at`.** No unvoided-load defect exists.
- **No load carries more than one live invoice.** No double billing.
- 3,788 journal entries, **0 unbalanced**, Dr = Cr = **$3,240,860.36**.
- 1090 Undeposited Funds **$315,561.76** · 6300 **$230.00** — AUTH-136 targets hit exactly.
- `is_sample_data` in USMCA: **0**.
- Cost side still open and still real: **4 revenue loads with no driver bill** (286.C.1, CC-3) and **18 with
  no expense at all** (286.C.2, CC-1 — link against Codex #36's 424 unlinked lines before creating).
- **286.C.3 stands: 58 loads with no fuel transaction is NOT a defect.** Nobody invents fuel.

## 287.6 — STANDING ORDER FOR EVERY SEAT, INCLUDING LEAD
**Read the closed documents BEFORE measuring, not after the owner corrects you.**
`00-USMCA-RECONCILIATION-CLOSED-NEVER-ASK-AGAIN.md` · `00-CLOSED-USMCA-SETTLEMENTS-5769-TO-5819-...` ·
`00-CLOSED-RAFAEL-LOCAL-DRIVER-WEEKLY-SALARY-...` · `00-USMCA-DATA-LOCK-GATE-2026-09-28.md`
A measurement that contradicts a closed document is a bug report about the app, never a correction to the
document. A question the closed document already answers is not diligence — it is the drift the owner keeps
having to catch.
