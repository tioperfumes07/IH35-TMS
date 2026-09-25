# ROUND 160 — CC-1 — TRANSPORTATION LOADS OUT OF USMCA; EVERY EXPENSE ON THE SHARED SETTLEMENT STAYS WITH USMCA. FIRST PRIORITY.
Claude Lead, 09-25-2026 11:05 AM CT (16:05Z).

Owner (ruling, already asked and answered): "we use transportation always track account and quickbooks account... we transitioned from transportation to usmca... i need this app with real data, only usmca. all expenses related to the shared settlements are for usmca, so a settlement from always will show both loads, one belonging to usmca and one to transportation, and all expenses, etc. in our settlement it should only show our load, for usmca, and all expenses are attributed to usmca. so our settlements will probably show a loss."

## Authority (open it; do not re-derive)
`~/Desktop/IH35-AUGUST-RECONCILIATION-BOTH-ENTITIES.xlsx`:
- sheet `6 FARO · TRANSPORTATION`: invoices purchased by Faro on the **Transportation** portal;
- sheet `3 LOADS · TRANSPORTATION`;
- sheet `2 LOADS · USMCA`.

Later mapping: `~/Downloads/IH35-MASTER-RECONCILIATION/07-RECONCILIATION-OUTPUT/09-22-2026-FARO-INVOICE-TO-LOAD-COMPLETE.xlsx` (66 invoices → loads, plus sheet `SELF-CARRIED NOT IN FARO`) and `01-FARO/faro_load_map.json` (27 earlier-window rows).

## Measured live 16:00Z
USMCA has 114 live loads = 89 linked to USMCA Faro advances + 25 with a non-Faro invoice. Of those 25, these **13 are Transportation's** (Faro-purchased on the Transportation portal, per sheet 6):
**13497, 13502, 13503, 13504, 13505, 13506, 13507, 13509, 13522, 13530, 13531, 13533, 13539** (≈ $47,500 of invoices sitting in USMCA A/R as "not factored").

## Orders
1. **Those 13 loads leave USMCA:**
   - void each one's USMCA invoice (reason `Transportation load — Faro Transportation portal (Aug reconciliation sheet 6)`) through the invoice void engine;
   - then void or cancel the load in USMCA.
   - Void, never delete. Nothing is written to TRANSP.
2. **Their expenses, fuel, driver pay, escrow and deductions stay in USMCA.** They are USMCA's cost on the shared settlement. Re-link each expense from the Transportation load to the USMCA settlement (and to the USMCA load on the same settlement where there is exactly one; list any settlement with none). Linkage stays complete; nothing moves to TRANSP.
3. **USMCA settlements show only USMCA loads' revenue and every expense on the document.** A loss is correct.
4. **The parity ruler follows the owner's rule:** `verify-alwaystrack-parity.mjs` targets line haul for USMCA-owned loads only; driver pay, fuel and expenses stay whole per document. Change the target derivation, not a baseline; cite this round in the comment.
5. **Classify the remaining 12 non-Faro loads line by line** from the 09-22 files and the self-carried sheet:
   - 13572, 13578, 13582, 13595 (self-carried, with a settlement);
   - 13555 (inv 055, 2EMS) and 13540 (inv 026, IM Specialized): self-carried;
   - 13541: direct-pay;
   - 13513: the Aug file shows Faro inv 008 USMCA $525 but the app shows it not factored — resolve from the Faro register;
   - 13498, 13525 ($0), 13527, 13517, 13520: resolve each.
   For each, state the row you read.
6. Proof at the top of NOW-CC-1:
   - USMCA live loads = 89 Faro + self-carried + direct-pay + currently dispatched (count per bucket);
   - A/R = Faro open 298,762.00 + self-carried 12,592.40 (or the stated residual line by line);
   - parity green;
   - TB 0.
This goes BEFORE R-159. Next AUTH number, issued before execution. FAST-MERGE. Deadline 19:00Z.

## Faro default interest — NOT a defect. Leave it running.
The Faro agreement (`~/Desktop/CPA ANSWERS.docx`, Factoring Agreement Faro ↔ IH 35 Transportation) sets:
- Repurchase Term 30 calendar days + Grace Period 5 days;
- then **Default Interest 0.067% per day, compounded daily**.
The first purchases (8/10) passed 35 days on 9/14, so the $188.64 across 108 accruals is contractual. It raises the amount owed to Faro (2150), which is correct.
- Only check: verify the engine's rate = 0.067%/day, the start = purchase date + 35 days, and that it stops the day Faro is paid. One line of proof on NOW-CC-1.
