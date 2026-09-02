# OWNER RULING — Proforma on cash flow + invoice number = load number (2026-08-24 22:34 CT)

**Owner word (tonight):** cash flow is for **personal operating prediction**. Proforma / pre-invoice **must appear** so Jorge can see **projected receipts by delivery date** from dispatch. The **proforma number is the invoice number** and **that number is the load number**. It does **not** change when the document is sent or paid.

This **supersedes** the 22:18 CT “exclude proforma from cash forecast” GO. Do **not** hide proforma from **cash-flow prediction**.

## What MUST show (cash flow / forecast / daily prediction)

- Include **proforma / pre-invoice** amounts as **Projected income**.
- Bucket by **dispatch delivery date** (`mdata.load_stops` delivery `scheduled_arrival_at`, same as cash-flow Daily Prediction).
- Label the line **Proforma** or **Pre-invoice** (never as confirmed cash, never as Open A/R).
- Show the **load number** as the document number on that line.

## What must NOT change

- **A/R aging / Balance Sheet 1100** still exclude `status='proforma'` (ACCT-F223). A projection is not legally owed A/R.
- **No new GL** on proforma. Event-2 A/R JE still requires send + POD gate (CC-1 existing leftover).
- **One invoice row per load.** `status` may move `proforma` → `sent` → `paid`. **`display_id` never remints.**
- Going-forward **from-load** mint: human invoice number **= `mdata.loads.load_number`**. Historical `INV-YYYY-NNNN` rows stay; do not rewrite TRANSP QBO mirror.
- Prod CHECK today is `display_id ~ '^INV-[0-9]{4}-[0-9]{5}$'` (`0060_p3_t11_20_1_accounting_invoices_schema.sql`). CC-1 widens it in the same money PR if storing `load_number` as `display_id`. Print already maps load → `I-…` (`invoice-render.routes.ts`); chrome/cash-flow must match the **load number**, not a second sequence.

## Not U14 recertify. USMCA only. No TMS→QBO write-back.
