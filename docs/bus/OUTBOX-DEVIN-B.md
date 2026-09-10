# OUTBOX-DEVIN-B · 2026-09-10

DEVIN-B | B-3 DONE | merged #21663 @ 7712e1859a | PlannerGrid outside-range button now calls onExpandRange (widens days[] via widenPlannerRange), not scrollLeft. 4 parents wired (UnifiedTimeline, Truck, Loads, Driver→Safety). Guard: scripts/verify-planner-outside-range-widens.mjs. tsc exit 0, gate exit 0. | NEXT=B-1 REG-002

---

DEVIN-B | B-1 REG-002 PROPOSAL FOR CC-1 | vendor→expense-account map | NO WRITES MADE | CC-1 MUST CONFIRM BEFORE ANY WRITE

## Live vendor data-completeness (Neon br-fancy-credit-akjnd07a, bypass_rls=lucia, USMCA 5c854333)

### Per-field fill counts (602 active vendors, is_sample_data IS NOT TRUE, deactivated_at IS NULL)

| Category | Total | vendor_code | phone | email | tax_id | default_expense_account_id |
|----------|-------|-------------|-------|-------|--------|---------------------------|
| Driver (DRV-%) | 90 | 90 | 90 | 0 | 0 | 90 |
| Other | 512 | 0 | 28 | 20 | 0 | 512 |
| **All** | **602** | **90** | **118** | **20** | **0** | **602** |

### Backfill source availability

| Source | USMCA rows | Usable? |
|--------|-----------|---------|
| mdata.qbo_vendors | 0 | NO — zero USMCA rows |
| accounting.bills | 0 | NO — zero USMCA bills |
| driver records → vendor phone | already synced | NO — already reflected |
| customer records | N/A | NO — not a vendor source |

**Result: zero new backfill data available from permitted sources.** All non-money fields that can be filled from real sources are already filled. The remaining gaps (422 vendors without phone, 582 without email, 602 without tax_id, 512 without vendor_code) have no real source to populate from.

### Vendor→expense-account proposal (from live expense history, 385 expenses, 21 distinct vendors)

ALL 21 vendors currently default to "Ask My Accountant" (9000) — a placeholder, not a real GL mapping. The following proposes the dominant actual expense account per vendor, based on live expense_lines history:

| Vendor | Vendor UUID | Lines | Actual Acct | Acct Name | Proposed Default |
|--------|------------|-------|-------------|-----------|-----------------|
| LOVES | 5a529e97-5af6-4874-89c0-f300715101f2 | 339 | 5000 | Fuel & Diesel | **5000** (306/339 lines) |
| LOVES TRAVEL STOPS | 95307de7-2e0a-44b3-b3aa-e9d152754320 | 5 | 5000 | Fuel & Diesel | **5000** |
| PILOT | 62dd25a7-460e-4fd0-b4f7-d80ec59fd8a7 | 7 | 5000 | Fuel & Diesel | **5000** (6/7 lines) |
| THORNTON | 77bd5ca3-a12e-43e8-b871-cb2cfc703150 | 1 | 5000 | Fuel & Diesel | **5000** |
| FLYING | 54027dca-0d76-4a62-aba8-eb8245fce534 | 3 | 5300 | Tolls & Scales | **5300** (2/3 lines; 1 fuel line) |
| Fuel America | aece329d-ef9d-4622-8281-1f1051ce8bf4 | 3 | 5300 | Tolls & Scales | **5300** (2/3 lines; 1 fuel line) |
| PILOTMBRIDGE,OH | df60e8f6-bd3f-40a1-935b-864b5452060a | 1 | 5300 | Tolls & Scales | **5300** |
| VALERO | 7fec5469-05df-4567-ab08-9712cfaaa180 | 2 | 5300 | Tolls & Scales | **5300** |
| BLUEBEACON | fb73dfd0-3fda-46fd-ba63-bdd4c34ed855 | 2 | 5300 | Tolls & Scales | **5300** |
| Blue Beacon Truck Wash | 7d5ad3b9-30eb-44c9-862d-513539b10e22 | 3 | 5300 | Tolls & Scales | **5300** |
| FRONTIER TRUCK WASH | 47cb55c9-f770-4232-ad66-bf37932061bd | 1 | 5300 | Tolls & Scales | **5300** |
| TEN STAR TRUCKWASH | ce4af0ad-197a-422e-865f-d3cf1545494a | 1 | 5300 | Tolls & Scales | **5300** |
| SOAKERZ | 12861a73-2d81-4131-a7d3-71951aa7edc0 | 1 | 5300 | Tolls & Scales | **5300** |
| DTOPS | 5c557250-fb0b-433a-acf0-3ca123266c29 | 3 | 5300 | Tolls & Scales | **5300** |
| INDIANA TOLL ROAD | 05fc2af5-9fd5-4dcb-a2a8-d9c0a5b2e47f | 1 | 5300 | Tolls & Scales | **5300** |
| Laredo Cat Scale | 5abb5274-6deb-4d90-ac7f-fdb2d8b7e343 | 2 | 5300 | Tolls & Scales | **5300** |
| PENSION BELEN | b7f03bcb-0ca4-41a4-bf2c-e34ad4915645 | 1 | 6999 | Other Operating Expense | **6999** |
| SR FORWARDING,INC | 7140d5f6-bbb4-4796-8ea0-5c25a655c493 | 1 | DRIVERTRIPLU056412 | Driver Trip-Lumper Reimbursement | **DRIVERTRIPLU056412** |
| PALOS GARZA | e857ba2c-0e49-4136-a325-9377a2ee9579 | 4 | DRIVERTRIPLU056412 | Driver Trip-Lumper Reimbursement | **DRIVERTRIPLU056412** |
| Continental Forwarding | f926f629-269f-48f6-8c6e-f5b20651e112 | 1 | DRIVERTRIPLU056412 | Driver Trip-Lumper Reimbursement | **DRIVERTRIPLU056412** |
| TYSON | 6b7da6a2-efca-499e-9d29-cc0a12450a04 | 3 | DRIVERTRIPLU056412 | Driver Trip-Lumper Reimbursement | **DRIVERTRIPLU056412** |

### Notes for CC-1

1. **NO WRITES MADE.** This is a proposal only. CC-1 must confirm the GL mapping before any `default_expense_account_id` write.
2. **"Ask My Accountant" (9000) is a placeholder**, not a real GL mapping. All 512 non-driver vendors currently default to 9000.
3. **90 driver vendors** are correctly mapped to 6890 (Cost of Labor–Mexico Drivers) — no change proposed.
4. **2 insurance vendors** are correctly mapped to 5600 (Truck Insurance) — no change proposed.
5. **491 of 512 non-driver vendors have NO expense history** — no evidence-based proposal is possible for them. They should remain on 9000 until CC-1 determines a policy.
6. **LOVES** has mixed usage (Fuel 306, Tolls 28, Tires 2, Other 3) — proposed 5000 as the dominant account (90% of lines).
7. **Truck wash vendors** (Blue Beacon, Frontier, Ten Star, Soakerz) are currently coded to 5300 (Tolls & Scales) in expense history — CC-1 may want to verify whether a dedicated "Truck Wash" account is more appropriate than Tolls & Scales.
8. **vendor_code, tax_id**: zero source data available for backfill — no action possible without owner-provided data.

### Request

CC-1: please confirm or adjust the proposed default_expense_account_id mappings for the 21 vendors above. Once confirmed, Devin-B will write the updates via a migration or service-layer script (no direct SQL writes to financial tables).
