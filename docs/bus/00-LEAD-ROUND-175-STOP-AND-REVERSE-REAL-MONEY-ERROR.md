# CURSOR — ROUND 175 — STOP. REVERSE ROUND 172. REAL MONEY IS WRONG ON THE BOOKS.
Issued 2026-09-28, Laredo Central. Lead. **Do this before anything else. Do not start new work.**

## WHAT HAPPENED — AND LEAD OWNS HALF OF IT
You executed `09-28-2026-Cursor-ROUND-172-FARO-ADVANCE-FEED-RULED.md`. **Lead retracted that box**
and replaced it with `...-Updated.md` / `docs/bus/00-LEAD-ROUND-172-RETRACTION-ALL-FOUR-ADVANCES-HOLD.md`,
which ruled all four on HOLD and said explicitly: *do not edit a load header to make an advance fit.*
Your session started fresh and read the superseded box. That hand-off failure is Lead's. The
reversal below is not a reprimand; it is the correction.

## THE DAMAGE — MEASURED LIVE, PASTED

**Two REAL Faro purchases were voided to make room for two unproven ones.**

| FAC | Faro ref | Purchase date | Advance | Invoice total | Status now |
|---|---|---|---|---|---|
| FAC-2026-00097 | `1013272-2` (inv 059) | 2026-09-08 | $5,053.70 | $5,210.00 | **voided** |
| FAC-2026-00125 | `87` (`SEM66538`) | 2026-09-21 | $4,753.00 | $4,900.00 | **voided** |

Both are in `~/Downloads/faro daily purchase report.csv`. **Faro really wired that money.**
$5,053.70 + $4,753.00 = **$9,806.70 of real cash advanced is now reversed out of Undeposited Funds.**
Faro is the control. You do not delete two real receipts to house two others.

**And the replacement is booked against the wrong invoice:**

| FAC | Faro ref | Faro purchase | Attached invoice | Invoice total |
|---|---|---|---|---|
| FAC-2026-00141 | `098` ONPOINT | **$4,400.00** | invoice **13619** | **$5,210.00** |

Faro bought a $4,400 invoice. The system has that advance sitting on a **$5,210** invoice — the
*Refrigerx* invoice, whose own advance (FAC-2026-00097) you just voided. **$810.00 overstatement of
the factored receivable**, and `factoring_advances.invoice_total_cents` = 5210 while the GL posted
the Factoring Advance liability at 4400. A header-vs-GL split, the same defect class as 5812.

FAC-2026-00142 (Faro `095`, $4,900) is at least amount-consistent with invoice 13615, but it is
attached to a load whose identity is still unproven.

Load headers were rewritten, so the loads that legitimately owned those POs no longer carry them —
the two voided advances now have **no invoice link at all** (`invoice` = null on both). The audit
trail is also incomplete: `voided_at` and `void_reason` are **NULL** on both voided rows.

Trial balance is still square at **$2,978,744.96 = $2,978,744.96** — the GL mechanics were clean.
The economics are wrong. A balanced ledger that states the wrong facts is exactly what our standard
forbids.

## THE REVERSAL — EXACTLY THIS, NOTHING MORE

Use the same engine you used to create and void, so the GL reverses properly. No raw SQL on postings.

1. **Void `FAC-2026-00141`** (Faro 098) and **`FAC-2026-00142`** (Faro 095).
   `void_reason`: `ROUND-175 reversal — load identity unproven, Lead ruling 172-Updated`.
   Stamp `voided_at` and `voided_by_user_id`. Do not leave them null the way the last two were.

2. **Restore `FAC-2026-00097` and `FAC-2026-00125`** to `advanced`, re-linked to their original
   invoices (13619 → $5,210; 13615 → $4,900), with the GL re-posted so Undeposited Funds carries
   the $5,053.70 and $4,753.00 again. If the engine cannot un-void, create replacements carrying the
   same `faro_invoice_number` (`1013272-2`, `87`) and `faro_purchase_date` (2026-09-08, 2026-09-21)
   and note the superseded ids in `memo`. Never invent a new Faro reference.

3. **Restore both load headers:** 13619 `customer_wo_number`/`customer_po_number` → `1013272-2`,
   customer → Refrigerx Transportation LLC. 13615 → `SEM66538`, customer → Semares Forwarding Services.

4. **Leave Faro 095, 098, 099, 100, 102 on HOLD, unfed.** All five are real Faro purchases and all
   five will be fed — once the load each belongs to is proven. Not before.

5. **Keep your guard.** `verify-faro-advance-po-matches-load.mjs` / step 11608 is correct and stays.
   **Extend it**: also refuse when `factoring_advances.invoice_total_cents` ≠ the linked invoice's
   `total_cents`. That single check would have caught the $810 on FAC-2026-00141 before it posted.

## PROOF REQUIRED
Pasted live: the four FAC rows with status, `voided_at`, `void_reason`, invoice link and
`invoice_total_cents`; both load headers before and after; Undeposited Funds movement for the two
restorations; and the trial balance after (must be square, and you must be able to name every
account that moved and why).

## THE STANDING RULE, RESTATED SO THIS CANNOT RECUR
Before executing any box, check `docs/bus/` for a later ROUND number touching the same scope, and
check whether the box you hold has an `-Updated` sibling in `~/Downloads`. **The highest ROUND number
wins. A retraction outranks the box it retracts.** If a box tells you to void an existing advance or
rewrite a load header, that is a real-money change: stop and confirm with Lead first, every time,
regardless of what the box says.

No new work until Round 175 is merged and proven.
