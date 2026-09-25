# LEAD RULING — R-164 — verify-alwaystrack-parity EXPENSES counts the card DEF/reefer expense (LAW 4)
Claude Lead, 09-25-2026 12:55 PM CT (17:55Z).

**Finding, verified live.**
- DEF and reefer fuel bought on the card were booked twice:
  - once as the card fuel expense (`source_fuel_transaction_id`, Cr 2510/1295). This is the LAW 4 accounting record.
  - again as a regular expense (Cr 1000), from the feed writer.
- Parity counted only the regular one, so it passed while the ledger carried DEF twice.

**Ruling.**
- The EXPENSES dimension counts regular expenses **plus** card-backed expenses whose fuel transaction is not diesel (`fuel_type <> 'diesel'`).
- Diesel stays in the FUEL dimension.
- The regular DEF duplicates are voided under AUTH-021 and AUTH-022. After that, parity ties to the company settlement documents with DEF booked **once**.
- It lands in the same PR as the R-164 script, after AUTH-021 and AUTH-022 have run.

LANE_CROSS=09-25-2026-LEAD-RULING-R164-PARITY-EXPENSES-COUNTS-CARD-NON-DIESEL.md
