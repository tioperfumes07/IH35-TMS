# INSTRUCTION RECONCILIATION — ONE SOURCE PER TOPIC

**Author:** Claude Lead · **Date:** 2026-09-13 · **Status:** BINDING. Read this before opening any other instruction doc dated 2026-09-13.

Three instruction documents for the same work landed on `main` within an hour (PR #22013 mine, PR #22014 Cursor's). Two competing specs for one dispute window and two seat tables is how seats drift apart and how the same defect gets built twice. This resolves it. Nothing below is a new ruling — it names which document governs which topic, and corrects one error of mine.

---

## 1. MY ERROR — CORRECTED

In PR #22013 I wrote that the dispute window was a clean slate: *"All three existing dispute tables are empty (0 rows) and invoices have no dispute column at all."*

**That was wrong.** I searched `accounting.invoices` for a dispute column and searched tables on settlement/expense/fuel name patterns. I never searched for a dispute table on the A/R side. There is a fourth table — **`accounting.invoice_disputes`** — and it is not empty.

Live, USMCA, read 2026-09-13 under `app.bypass_rls='lucia'`:

| Invoice / load | Invoiced | Faro expected | Disputed | Reason | Status |
|---|---|---|---|---|---|
| 13581 | 4,900.00 | 3,300.00 | **1,600.00** | short_pay | **open** |
| 13586 | 3,600.00 | 3,300.00 | **300.00** | short_pay | **open** |

**$1,900.00 of open customer short-pay, opened today by the Faro USMCA export reconciliation, with no screen anywhere in the app that shows it.** Cursor was right on this point and my "clean slate" framing was wrong. It matters: it means the dispute window is a **migration**, not a greenfield build, and those two rows must survive it.

Note for the ingest work: document 5803 prints load 13586 at 3,600.00 line haul, which equals what we invoiced. The document and the app agree; Faro paid 3,300.00. This is a genuine customer short-pay, not an ingest defect. Do not "fix" 13586 to 3,300.00.

---

## 2. WHICH DOCUMENT GOVERNS WHICH TOPIC

| Topic | Governing document | Superseded / reference only |
|---|---|---|
| Absorption law + AlwaysTrack ingest rules | `claude/2026-09-13-ABSORPTION-INGEST-AND-DISPUTE-WINDOW-INSTRUCTIONS.md` (Cursor, #22014), Parts A–B | my `claude/09-13-2026-USMCA-ABSORPTION-LAW-AND-INGESTION-SPEC.md` — keep for its Part 2 target numbers and Part 3.1 natural keys, which are the acceptance figures |
| Acceptance numbers for ingest | my spec, Part 2 — the six totals and the seven absorbed loads | — |
| Natural keys for idempotency | my spec, Part 3.1 | — |
| Dispute window | my `claude/09-13-2026-UNIFIED-DISPUTE-WINDOW-SPEC.md`, **as amended by §3 below** | Cursor doc Part C — consistent in substance, thinner in detail; its one distinct ruling is folded into §3 |
| Seat assignments | Cursor doc PART D, **as amended by §4 below** | my earlier per-seat boxes for this work |

The two absorption statements agree on the law. Where wording differs, the tested predicate governs: **a settlement whose END date is on or after 2026-08-07 is USMCA in full — every leg, every cost, nothing splits back.** 0 exceptions across 44 documents (#22012).

---

## 3. AMENDMENTS TO THE DISPUTE WINDOW SPEC

**A3.1 — `accounting.invoice_disputes` is an EXISTING table with live data.** My spec's §1 listed three empty tables to retire. Add this fourth one, and it is not retired blind: its two open rows are **migrated** into `disputes.disputes` as `subject_type = 'invoice'`, preserving `opened_at`, `opened_by_user_id`, `reason_code`, `reason_text`, the disputed/invoiced/expected amounts and `source_system`. The migration is idempotent and asserts 2 rows in, 2 rows out. `accounting.invoice_disputes` then becomes a NEVER WRITE table — repoint the writer, do not drag the FK.

**A3.2 — `expected_amount_cents` becomes a first-class field.** The existing invoice-dispute model carries invoiced / expected / disputed as three separate amounts, which is more precise than my two-amount model and is exactly right for a short-pay. `disputes.disputes` adds `expected_amount_cents bigint null`. For a short-pay, `disputed = invoiced − expected`, and the guard asserts that identity where all three are present.

**A3.3 — An invoice dispute never touches `accounting.invoices`.** Cursor's ruling, and it is correct and now law: the A/R stays open for the full delta while the dispute is live. No write-down, no partial-payment fiction, no edit to a sent invoice. It is the same rule as my H3, stated for A/R. Resolution issues a credit memo or records the collection; it never reduces the invoice in place.

**A3.4 — The hub surfaces both types on day one.** `/accounting/disputes` must list settlement disputes and invoice disputes together, and 13581 and 13586 must be visible on it the first time it loads. A hub that ships without those two rows on screen is not done.

**A3.5 — Everything else in my spec stands:** the 12 subject types, the window policy model, the state machine, maker ≠ checker, adjustment-never-edit, payment withholding, the queue, the detail, the driver app, and the 10-point acceptance guard. The three owner decisions at the end of that spec are still open.

---

## 4. AMENDMENTS TO THE SEAT TABLE

The owner reduced the seats to **CC-1, CC-2, CC-3 and Lead. Cursor is off this work.** Cursor's PART D stands with three changes:

1. **The dispute window is CC-2's, named.** PART D row 4 reads "CC-2 or assigned FE seat". With three seats there is no unassigned FE seat. **CC-2 owns it**, including the `accounting.invoice_disputes` migration in A3.1.
2. **CC-3 also carries ROUND 23.1 — Truck Line, five owner-raised defects** (`09-13-2026-CC-3-TRUCK-LINE-FIVE-DEFECTS.md`): driver rows on a unit board, unreadable stale GPS that drops the location, Live signal missing the state, Next appointment showing one stop instead of pickup and delivery, and no column sorting at all. That box was written for Cursor and is reassigned. It is ahead of B2/B3/B7 in priority — the owner is looking at that screen.
3. **Every PART D deliverable inherits my spec's prohibitions:** no test/sample/demo rows in USMCA for any reason including proof; void never delete; no new GL math; never edit an applied migration; bank matching stays suggest-only forever.

Deadline stays **2026-09-15 23:59 UTC**, except Truck Line at **2026-09-14 20:00 UTC**.

---

## 5. STANDING RULE — ONE AUTHOR PER LAW

A law, a spec or a seat table is written once, in one file, and every other document points at it rather than restating it. A restatement is a copy that drifts the moment either side is edited, and the seats cannot tell which copy is current. If a second seat believes a governing document is wrong, it files a correction against that document — it does not publish a parallel one.
