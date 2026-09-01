# ⛔ STOP — INSURANCE SCHEMA ALREADY EXISTS. DO NOT BUILD IT. · 2026-08-31 22:10Z
**Corrects `RULING-TRAILERS-AND-INSURANCE-UNBLOCK` item 2 and `GO-INSURANCE-BOUND` CC-1 items 1–5.**

I told CC-1 to build an insurance schema. **It is already built.** Building a second one would be a
duplicate financial subsystem — the most expensive kind of mistake in this repo. Verified live 22:05Z:

```
insurance.policy             5 rows      insurance.policy_unit        4 rows
insurance.payment_schedule   2           insurance.type_catalog      45
insurance.claim              8           insurance.coi_request        1
insurance.lawsuit            2           insurance.refund_obligation  1
```

**And the columns are right.** `insurance.policy` already carries `insurer_name · policy_number ·
coverage_type · effective_date · expiry_date · total_premium_cents · down_payment_cents ·
installment_count · due_day · late_fee_pct · insurer_email · agent_contact · status ·
renewed_from_policy_id · cancelled_on · cancel_reason · allocation_method · operating_company_id`.
`insurance.policy_unit` carries `policy_id · asset_id · **insured_value_cents** · **removed_at** ·
cost_per_month_cents`. `insurance.payment_schedule` carries `due_date · amount_cents · status ·
paid_at · late_fee_cents · bill_uuid`.

## Three of my own statements are now corrected
1. **"The $343,495 / $1,077,940 has nowhere to live" — WRONG.** `policy_unit.insured_value_cents`
   is exactly that column. It is empty, not missing.
2. **"CC-3 blocked on `insurance.policy` rows = 0" — WRONG.** There are 5 rows. They are the
   **test** policies (SAMPLE Progressive · CC3 Verify Vendor ×2 · ZZ-SAMPLE Vendor A ·
   `POL-TESTMTDQ164H`). What is missing is a **real** policy, not the table.
3. **"Build endorsement history" — already possible.** `policy_unit.removed_at` +
   `policy.renewed_from_policy_id` + `cancelled_on` model T144's removal and T163's addition as
   events today. No new table.

## WHAT ACTUALLY REMAINS — verify and populate, do not rebuild
**CC-1 (money spine) — the ONLY schema question left:**
- `policy_unit.asset_id` → what does it reference? If it does not reach `mdata.equipment` /
  `mdata.units` by VIN, that link is the single genuine gap. **Report the FK before writing anything.**
- Whether the three-policy structure (AL admitted vs APD/MTC surplus-lines, per-policy fees,
  25% minimum earned) is expressible in the existing columns, or needs additive fields only.
- **Additive only. No new insurance tables. No duplicate subsystem.**

**Populate, once the endorsed premium + updated COI arrive — through the UI, not SQL:**
3 real policies · 15 power units + 20 trailers into `policy_unit` with `insured_value_cents`
(trailers tie exactly to **$343,495**; APD TIV **$1,077,940**) · FIF `payment_schedule`
(9 × $24,252.61 from 2026-09-19) · EDSA down payment ($58,000 at $5,000/week minimum).

**CC-3 — you are NOT blocked on schema.** Your ID-card/COI upload needs `docs.files` (which has
`category_id`, `document_date`, `expiration_date`, `parent_file_id`, versioning — all present) and
the `policy_unit.asset_id` answer from CC-1. Proceed on everything that does not need that FK.

## THE GENERAL LESSON — this is now a standing rule
**Before any seat builds a table, schema, or module: query `information_schema` and prove it does
not already exist.** Two of today's "blocked, needs schema" reports were wrong in the same way.
A seat that reports "blocked on schema" must paste the `information_schema` query and its result.
No exceptions. Assumed-absent is not absent.

## STANDING
LIVE CLICK ONLY · one real end-to-end chain, not bulk entry · one financial driver, many Samsara
profiles · no merges of driver rows today · no insurance JE until endorsed premium + updated COI ·
reverse never erase · nobody closes August but the owner.
