# OWNER DECISIONS — FINAL (2026-07-26)

Complete answered set. Only **F15** pends one word. No outside accountant — you decide. QBO write-back never on; posting ON in all 3 entities for testing.

## A — Money
- **A1 — alert after 7 days** unmatched (single threshold).
- **A2 — B**: dedicated intercompany accounts per pair (already seeded on Neon, all 3 pairs).
- **A3** — fuel overage: **150-gal/swipe (~$900 today, moves with price)**; non-fuel = personal = auto-recover full, except repairs/authorized.
- **A3b** — approve first, then recover.
- **A3c** — new "Driver Fuel-Overage Receivable" (not Cash Advance).
- **A3d** — escrow → if short → "Driver Damage Loss".
- **A4-D1 — A**: one "Fixed Asset – Trucks".
- **A4-D2 — A**: new "Heavy Repair Expense" account.
- **A4-D3 — C**: hybrid (shop invoice = bill; on-the-spot cash = expense).
- **A4-D4 — build the FULL fixed-asset + auto-depreciation register NOW** (never defer).
- **A4-D5 — A**: require a Work Order.
- **A4-D6 — $7,000** capitalize-vs-expense threshold.
- **A5 — A**: agent prepares + applies escrow seed on Neon.

## B — Invoicing (build the whole flow automatically, fully wired)
- **B2a — A**: auto-create a Pro Forma Invoice at booking.
- **B2b — A**: call it "Pro Forma Invoice".
- **B2c — A**: broker advance booked as a liability, applied to the pro forma, netted at POD — auto.
- **B2d — yes**: at POD auto-convert to Official Invoice + auto-send to factoring.
- **B1 — A**: manual "Bill TONU", owner approves.
- **B3 — C**: block a line with no account; "Uncategorized" is the only fallback.

## C — Settlements / Factoring
- **C1 — A**: escrow → pay → Damage Loss, automatic + fully wired.
- **C2 — E**: editable catalog with `may_draw_escrow`, seeded abandonment + damage + safety fines, add/rename reasons.
- **C2b — $2,500** escrow cap (code caps $2,000 today → change to $2,500).
- **C3 — B**: Faro is also a full vendor.
- **C4 — later**.
- **C5 — CORRECTED: the COMPANY absorbs factoring chargebacks, NOT the driver** (company drivers, not owner-operators).

## D — Maintenance / Safety
- **D1 — B**: split safety fines (DOT vs internal).
- **D2 — C**: inventory parts ≥ $50.
- **D3 — C**: one cancellation catalog with `applies_to`.
- **D4 — C**: build accessorial engine after the invoice exists; standard default amounts, editable per invoice, vary by customer (amounts TBD by you).

## E — Tax / Close
- **E1 — A**: no withholding from anyone (Mexico B1/B2 drivers, Mexican mechanics, all). W-8BEN on driver file AND in Legal. **No 1042-S/1099.**
- **E2 — C**: suggest + a person confirms.
- **E2b — 1**: auto-block dispatch on a positive drug/alcohol test.
- **E3 — A**: build state hire-doc storage now.
- **E7 — A**: Admin / Owner / Accountant can close.
- **E8 — A**: you/Martin do the year-end roll; system reports.

## F — Scope
- **F1 — build now**: lending analytics, in the Finance Hub.
- **F2 — build now**: activity/audit dashboard.
- **F3 — later**: calibration tracking.
- **F4 — later**: document-control lifecycle.
- **F5 — build now**: commodity → equipment, in the invoice; needs catalog/list + wizard.
- **F6 — later**: commodity rates.
- **F7 — build now**: 425C Exhibit C (you do it by hand today).
- **F8 — build**: notifications (you need it).
- **F9 — A**: never delete money/audit/maintenance records; kill any such job.
- **F10 — later**: IDVR.
- **F11 — later**: key rotation.
- **F12 — A**: keep deduping, money-first.
- **F13 — A**: JE maker≠checker in the app now.
- **F14 — A**: resizable columns, all columns (standard).
- **F15 — hybrid**: finance home = key numbers on top (cash, A/R, A/P, unreconciled, MTD revenue) + quick-action shortcuts below.
- **F16 — A**: factoring required-docs; blocked by default, owner can override at that moment.

## G — Colors
- **G1 — A** keep navy. **G2 — A** keep navy.

## H — Ops
- **H1** — post in all entities now (QBO write-back off).
- **H2** — any agent (GUARD, Claude Coder, Cursor) may prepare + apply Neon on your word.
