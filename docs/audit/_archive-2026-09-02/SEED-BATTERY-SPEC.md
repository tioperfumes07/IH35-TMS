# SEED-BATTERY SPEC — surface → account → expected JE for UNVERIFIABLE C rows

**Purpose:** Define the exact seed transaction needed to convert each UNVERIFIABLE-until-data C-layer row
into a real PASS or FAIL. Each entry specifies: the triggering UI surface, the accounts that must resolve,
and the expected balanced journal entry. Once the seed is posted and each JE is live-confirmed on Neon,
GUARD can flip the row to PASS or FAIL.

**Rules:**
- Only GUARD writes VERIFIED after confirming JE balance + bidirectional FK walk on Neon.
- Each seed transaction must be entity-scoped (TRANSP for production, USMCA for isolated testing).
- Every seed must produce a BALANCED journal entry (DR = CR, `assertBalanced()` in posting-engine).
- Seed transactions are NOT test data — they are real, minimal, production-valid transactions.

---

## TRANSP seeds (rows 118–133)

### SEED-01: Load → Invoice → AR → GL (rows 118, 120, 145)
| Step | Surface | Action |
|---|---|---|
| 1 | Dispatch `/dispatch` | Create load with real customer, shipper/consignee, assign driver+unit |
| 2 | Dispatch `/dispatch/:id` | Complete the load (all stops delivered) |
| 3 | Accounting `/accounting/invoices` | "Create from load" → `POST /api/v1/accounting/invoices/from-load` |
| 4 | Accounting `/accounting/invoices/:id/send` | Send the invoice |
| 5 | Posting (manual or backfill) | `POST /api/v1/accounting/posting-engine-mvp/post` with `source_type=invoice` |

**Expected JE:**
```
DR  Accounts Receivable (role: ar_control)       $[load.total_rate]
  CR  Revenue — [line income account per category map]  $[per-line amounts]
  CR  Sales Tax Payable (if applicable)                 $[tax]
```

**Account resolution:** `buildInvoiceLines` → `assertRevenueLinesHaveIncomeAccount` → per-line income from
`catalogs.expense_categories` (revenue category) → `account_id`. AR from CoA role `ar_control`.

**Validates rows:** 118 (invoice→GL), 120 (load→invoice→GL), 145 (customer→invoice→GL)

---

### SEED-02: Vendor Bill → AP → GL (rows 119/partial, 598)
| Step | Surface | Action |
|---|---|---|
| 1 | Accounting `/accounting/bills` | Create vendor bill with Section-A category line |
| 2 | (auto) | Posting engine fires on save (once #4062 merged — validator fix) |

**Expected JE:**
```
DR  Expense — [expense_category → account via expense_category_account_map]  $[line.amount]
  CR  Accounts Payable (role: ap_control)                                      $[bill.total]
```

**Account resolution:** `buildBillLines` → `expense_category_uuid` → `catalogs.expense_categories.account_id`
→ GL account. AP from CoA role `ap_control`.

**Blocked by:** Row 595 (#4062 bill-validator fix). Once merged + deployed, first bill save should auto-post.

**Validates rows:** 119 (bills USMCA), 598 (subledger-gl-dark class, partially)

---

### SEED-03: Work Order → Bill → GL (row 121, 596, 597)
| Step | Surface | Action |
|---|---|---|
| 1 | Maintenance `/maintenance/work-orders` | Create work order for a real unit, assign vendor |
| 2 | Maintenance `/maintenance/work-orders/:id` | Add cost lines (Parts & Labor, Section-A category) |
| 3 | Maintenance `/maintenance/work-orders/:id` | Close/complete the work order |
| 4 | (auto) | `getOrCreateBillForWorkOrder` fires, creates bill with `linked_work_order_uuid` |
| 5 | (auto) | Bill posting engine fires → JE |

**Expected JE:**
```
DR  Maintenance Expense (or parts-specific account per category)  $[WO total]
  CR  Accounts Payable (role: ap_control)                           $[WO total]
```

**Account resolution:** WO close → `maintenance-posting/poster.service.ts` → expense category →
`expense_category_account_map` → GL account. AP from CoA role `ap_control`.

**Blocked by:** Row 596 (#4048 WO-vendor fix for USMCA), Row 597 (cost-line-validator for ALL)

**Validates rows:** 121 (TRANSP WO→Bill→GL), 305 (USMCA same chain)

---

### SEED-04: Fuel Transaction → Expense → GL (row 599)
| Step | Surface | Action |
|---|---|---|
| 1 | Admin endpoint | `POST /api/v1/fuel/fuel-gl-reflush/reflush` (admin-triggered) |
| OR | Fuel `/fuel` | Import new fuel CSV with ≥1 diesel transaction |

**Expected JE (per transaction):**
```
DR  Fuel Expense — Diesel (role: fuel_diesel_expense)        $[txn.amount_cents/100]
  CR  Accounts Payable OR Undeposited Funds (per payment_method)  $[txn.amount_cents/100]
```

**Account resolution:** `postFuelExpenseFromEvent` → category map (diesel|def|reefer|oil|misc) →
expense account. Credit from CoA role `ap_control` or `undeposited_funds` per subtype fallback.
Idempotency: `fuel-posting:v1:<company>:<fuel_transaction_id>:<posting_path>`.

**Blocked by:** Nothing code-wise — the poster is wired and flag is ON. The backfill has simply never been
run. Running the reflush is the seed.

**Validates rows:** 599→**673** (CLS-FUEL-GL-DARK / CLS-FUEL-DOUBLE-POST superseded — scope mismatch; category-map residual), and partially 122 (fuel B-layer load_id linkage)

---

### SEED-05: Settlement → Driver Pay → GL (row 123, 133)
| Step | Surface | Action |
|---|---|---|
| 1 | Settlements `/settlements` | Create a pay run (requires ≥1 load with revenue, ≥1 assigned driver) |
| 2 | Settlements | Execute the settlement (approve + finalize) |
| 3 | (auto) | Settlement posting fires → GL run |

**Expected JE:**
```
DR  Driver Pay Expense (role: driver_pay_expense)           $[gross_pay]
DR  Driver Escrow Deductions (role: escrow_deduction)       $[deductions, if any]
  CR  Driver Payable (role: driver_payable)                   $[net_pay]
  CR  Escrow Liability (role: escrow_liability)               $[deductions]
```

**Account resolution:** `settlement-posting.service.ts` → per-deduction-type account map →
`catalogs.driver_deduction_types.account_id`. Base pay from CoA role `driver_pay_expense`.

**Blocked by:** Row 600 (WF064 consumer disconnected), lack of completed loads with revenue (row 120).
Settlement requires: load delivered → invoice posted → revenue recognized → settlement eligible.

**Validates rows:** 123 (settlements→GL), 133 (driver→settlement→GL)

---

### SEED-06: Internal Fine → Liability → GL (row 129)
| Step | Surface | Action |
|---|---|---|
| 1 | Safety `/safety` | Create internal fine for a driver |
| 2 | (auto) | `safety.internal_fines` → `driver_finance.driver_liabilities` |
| 3 | (Settlement run) | Liability deducted in next settlement → GL |

**Expected JE (at settlement):**
```
DR  Driver Escrow — Fine Recovery (role: fine_recovery or damage_recovery)  $[fine_amount]
  CR  Driver Payable (reduced net pay)                                        $[fine_amount]
```

**Account resolution:** Fine type → `driver_finance.driver_liabilities.liability_type` → deduction
account map → GL. Requires settlement to realize the GL entry.

**Blocked by:** Settlement chain (SEED-05). Fine creation alone does not post to GL — it only creates
the liability record. GL impact is at settlement time.

**Validates rows:** 129 (safety→GL)

---

### SEED-07: Fleet Unit → QBO Class → Class-tagged JE (row 130)
| Step | Surface | Action |
|---|---|---|
| 1 | Fleet `/fleet/:unit_id` | Set `qbo_class_id` on a unit (map to a class from `mdata.qbo_classes`) |
| 2 | (Any posting) | Next JE posting for that unit flows `class_id` into `journal_entry_postings` |

**Expected JE delta:**
```
(Any posting for this unit will include class_id = <uuid> on each journal_entry_postings row)
```

**Account resolution:** `class_id` is a tagging field, not an account. It flows from
`mdata.units.qbo_class_id` → posting context → `accounting.journal_entry_postings.class_id`.

**Blocked by:** Need any posting (invoice, bill, expense) to reference the unit. After SEED-01/02/03,
set `qbo_class_id` on the load's assigned unit and re-post.

**Validates rows:** 130 (fleet→GL class tagging)

---

### SEED-08: Insurance Claim → Recovery Posting → GL (row 124)
| Step | Surface | Action |
|---|---|---|
| 1 | Insurance `/insurance` | Create policy (requires unit assignment) |
| 2 | Insurance | Create claim against policy |
| 3 | (manual) | Process recovery → `accounting.insurance_claim_recovery_postings` |

**Expected JE:**
```
DR  Insurance Recovery Receivable (role: insurance_recovery)  $[recovery_amount]
  CR  Insurance Expense Recovery (contra-expense)               $[recovery_amount]
```

**Account resolution:** `insurance_recovery` CoA role (designated in #4015). Recovery posting service
resolves via role binding.

**Blocked by:** 0 policies exist (confirmed data gap). Need policy creation first. The full 9-hop chain
(claim→driver→unit→trailer→policy→deductions→liability→asset→JE→GL) requires live data at every hop.
Two structural gaps confirmed: claim→deductions (no FK), claim→liability (wired only to internal fines).

**Validates rows:** 124 (insurance→GL)

---

### SEED-09: Factoring Advance → GL (row 125)
| Step | Surface | Action |
|---|---|---|
| 1 | Factoring `/factoring` | Set up factoring contract (requires real factor + invoices) |
| 2 | Factoring | Submit invoice for factoring → advance |
| 3 | (auto) | Factoring posting fires |

**Expected JE:**
```
DR  Cash/Bank (advance received)                              $[advance_amount]
DR  Factoring Fee Expense                                     $[fee]
  CR  Accounts Receivable (factored invoice removed from AR)    $[invoice_face]
```

**Account resolution:** `factoring-posting/poster.service.ts` → advance/reserve/fee accounts from CoA
roles. Requires active factoring contract + submitted invoices.

**Blocked by:** No factoring contract exists ("No active factor" state). Owner must establish factor
relationship before this seed can fire.

**Validates rows:** 125 (factoring→GL)

---

## USMCA seeds (rows 257, 303–310)

All USMCA seeds mirror the TRANSP seeds above but run against the USMCA entity (`5c854333`). The key
difference: USMCA has NO production data (0 loads, 0 invoices, 0 WOs, 0 fuel, 0 settlements). Each
USMCA seed is a clean-room test.

| USMCA Seed | Mirrors | Row(s) | Additional blocker |
|---|---|---|---|
| SEED-U01: Load→Invoice→GL | SEED-01 | 303, 304 | Need USMCA customer + driver roster activated |
| SEED-U02: WO→Bill→GL | SEED-03 | 305 | #4048 (vendor FK fix) + cost-line-validator |
| SEED-U03: Safety fine→GL | SEED-06 | 306 | Settlement chain first |
| SEED-U04: Fleet class→GL | SEED-07 | 307 | 0 QBO classes (no QBO connection). N/A until connected |
| SEED-U05: Settlement→GL | SEED-05 | 308 | `damage_recovery` binding fix (row 260) + driver roster |
| SEED-U06: Fuel→GL | SEED-04 | 309 | CLS-FUEL-GL-DARK / DOUBLE-POST superseded (row 673); seed still useful for load_id + category-map residual |
| SEED-U07: Insurance→GL | SEED-08 | 310 | 0 policies, same structural gaps as TRANSP |
| SEED-U08: Money-modules catch-all | SEED-01–09 | 257 | All above |

---

## TRK seeds (rows 437–440, 448, 510)

TRK is the asset holder. Its posting paths are ALL flag-gated OFF. Seeds cannot fire until flags are
enabled by owner decision.

| TRK Seed | Row | Chain | Blocker |
|---|---|---|---|
| SEED-T01: Bill→GL | 437 | bill → posting-engine → JE | `POSTING_ENGINE_ENABLED` OFF |
| SEED-T02: Depreciation→GL | 438, 510 | fixed_assets → depreciation_schedule → JE | `AMORTIZATION_GL_POSTING_ENABLED` OFF |
| SEED-T03: Lease→GL | 439 | lease_contract → lease_schedule → JE | `LEASE_GL_POSTING_ENABLED` OFF |
| SEED-T04: Intercompany→GL | 440 | transfer → paired_legs → JE → elimination | Requires posting engine |
| SEED-T05: WO→Bill for TRK units | 448 | work_order → bill (TRK-scoped) | Count unknown, flag OFF |

**TRK action required:** Owner must decide flag activation timing. Once flags are ON, TRK's 13,050
bills alone would generate ~13,050 JEs. This is a deliberate operational decision, not a code fix.

---

## Dependency graph (critical path)

```
#4062 (bill-validator) ──┐
                         ├── SEED-02 (Bill→GL) ──┐
#4048 (WO-vendor) ───────┤                       │
                         ├── SEED-03 (WO→Bill)   ├── SEED-05 (Settlement)
Cost-line-validator ─────┘                       │        │
                                                 │        ├── SEED-06 (Fine→GL)
SEED-01 (Load→Invoice→GL) ──────────────────────┘        │
                                                          └── SEED-07 (Class→GL)
Fuel reflush ──── SEED-04 (Fuel→GL) [INDEPENDENT — can run now]

Insurance policy creation ──── SEED-08 [INDEPENDENT — needs data, not code]
Factoring contract ──── SEED-09 [INDEPENDENT — needs owner, not code]
```

**Fastest win:** SEED-04 (fuel reflush). Zero code changes needed. The backfill endpoint exists, flag is
ON. Running it would clear $625K and flip row 599 from FAIL to evidence-for-PASS (pending GL balance
confirmation by GUARD).

---

## Scoreboard impact (when all seeds post)

Once each seed produces a confirmed balanced JE:
- 20+ UNVERIFIABLE C rows → PASS (or FAIL if the JE is wrong)
- Reduces the 23 FAIL+OPEN count as fixes land
- Does NOT change certified/30 — only GUARD does that after full 5-layer per-module confirmation
