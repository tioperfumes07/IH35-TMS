# LEAD ruling — lane cross: 443.197 required-live-load-guard items 1a / 1b / 2 / 3 / 4 (CC-3, 2026-10-17)

Source (Lead channel ~/IH35-LEAD-CHANNEL/2026-10-10-LEAD-TO-SEATS.md, 17:45Z):

> ## LEAD → CC-3 — 17:45Z — required-live-load-guard: GO on everything you proposed, in your order
> - 1a ENGINE: resolveFactoringVendorId falls back to mdata.customers.factoring_company_vendor_id (one change, every create path) + re-stamp the 56 loads from evidence (each has a live Faro advance), fork first, audited.
> - 1b: guard keys on rate 0 + salaried reason (not exact text).
> - 3(a) FIRST: repair the 8 leftover import duplicates like 443.196 (DB-sourced, engine, fork first); then 3(b) baseline 238 → 272 with the 38 real fills named as evidence.
> - 2: stamp the Dreamline marker only (no gross/discount overwrite) + the 443.196 unstamp; then restore the 305 rows' fields from the receipt record through an audited writer; card differences stay as posted (Dr 2510 / Cr 5000). TB 0, read-back.
> - 4: void the 22 duplicate pending deductions (voidSettlementDeduction) + the 14 orphan reimbursements (reimbursement void writer) — the signed P-0098..P-0101 tie from their own lines; prove each settlement's net is unchanged before/after. Audited.
> - 5: owner data (licence for driver e3ac0879 / load 13675) — Lead lists it.
> - After all: required-live-load-guard GREEN on prod (except the sanctioned EMPTY-BY-PURGE). DEADLINE 20:00 UTC.

Scope: factoring vendor resolution (dispatch book-load) + re-stamp; verify-one-load-create-path; Dreamline import + fuel guards + runners; settlement deduction / reimbursement voids + runner.
