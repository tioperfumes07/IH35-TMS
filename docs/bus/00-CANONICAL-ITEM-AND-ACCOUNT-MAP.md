# LEAD — CANONICAL ITEM MAP — 09-28-2026 1:58 AM UTC — USE THESE IDS, RESOLVE NOTHING BY NAME
USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`. Measured live by the Lead. 149 items now exist.
`catalogs.accounts` has **172 duplicated account numbers** — resolving by account_number can return
the wrong row. **Canonical ID only. Never a name lookup, never a number lookup.**

## CREATED BY THE LEAD TODAY — LIVE PROOF
```
id         40d73df6-07c0-418f-9e37-c6d7cde5b7b8
item_name  TRACTOR-Washout Expense
account    5320 Trailer Washout (273c22af-02df-4642-9744-886f772dd478)
created_at 2026-09-28 01:58:18.710365+00
```
Items before 148 -> after **149**. This was the ONLY genuinely missing item.

## PDF CATEGORY -> ITEM ID. THIS IS THE MAP. DO NOT CREATE ANY OF THESE.
| PDF category (AlwaysTrack, source of truth) | item_id | item name in app | account |
|---|---|---|---|
| Fuel-DEF-Diesel Exhaust Fluid | `009b48f2-f7aa-4548-b155-cedf66f427d3` | Fuel-DEF-Diesel Exhaust Fluid | 5000 |
| Fuel-Reefer Diesel | `a2df9d70-b35b-45f3-bf86-9c32bdc0a1c5` | Fuel-Reefer-Diesel | 5000 |
| Scale Expense:OTR-Scale Expense | `2c31f4d3-1538-4190-87c3-adf2e7e1be12` | OTR-Scale Expense | 5300 |
| Driver Reimbursement-TPE-Scale Expense | `a0a97d92-8e54-41e6-ab0c-37cd23f39869` | Driver Reimbursement-Scale Expense | 5300 |
| Driver Reimbursement-TPE-Toll Expense | `b78568f4-4797-45e5-98b1-bf7c1b5c3cb3` | Driver Reimbursement-TPE-Toll Expense | 5300 |
| Driver Reimbursement-Fuel-Def | `a37d5b67-ac60-4825-8511-37771e719078` | Driver Reimbursement-Fuel Def | 5000 |
| OTR-Mexico Tolls & Intl Bridge Expense | `ea839892-2631-417e-b21d-ca361c238e89` | Bridge Toll Expense-Mexico | 5300 |
| Warehouse-Lumper Fee Expense | `e09e3a25-a4c0-404c-abf1-2bb7ac329e45` | Warehouse Lumper Expense | 5310 |
| Reefer Trailer-Washout Expense | `aa07ce99-127c-4a29-af59-68d2bb694ff6` | Reefer-Trailer Washout Expense | 5320 |
| TRACTOR-Washout Expense | `40d73df6-07c0-418f-9e37-c6d7cde5b7b8` | TRACTOR-Washout Expense | 5320 |
| Road Service-Trailer Tire Expense | `b92a27bc-7175-488b-8743-21a02916d6d5` | Road Service-Trailer Tire Expense | 5500 |
| Road Service-Truck Tire Expense | `d2b34f56-92b0-44f4-92ff-b149322070a7` | Road Service-Truck Tire Expense | 5500 |
| Road Service-Truck Repair | `3648d94a-aa3a-45dc-8446-e7128ba1f11a` | Road Service-Truck Repair Expense | 5400 |
| GAS (Comp. Exp. = Y, blank vendor) | `e93a0c79-337f-4563-b0fc-d09c9b36e499` | Driver Reimbursement-Company Vehicle Fuel | 5000 |
| COMIDAS (Comp. Exp. = Y, blank vendor) | `c4adde9e-6901-436b-b917-736f1943fb5d` | Driver Meals Expense | 5100 |

## QUICK PAY — THE ACCOUNT ALREADY EXISTS, THE ITEM DOES NOT
`4970 Short-Pay — Agreed Concession / Quick-Pay Discount`, type **Income**,
id `ca5afa81-5b45-49a5-89b1-17093de39197`, **0 postings today**.
Company Settlement 5812 carries a `QP` column on CUSTOMER CHARGES (1.50% on load 13588, 3.00% on
13600) and `Quick Pay  2.19%  -232.50` in the REVENUE block.
Quick Pay is a REVENUE REDUCTION on the customer side, not an expense. It belongs on the charge line,
not in `catalogs.items` as an expense item. CURSOR: report the posting path you find. If none exists,
STOP AND REPORT. **No new GL math. No seventh engine.**

## NEW FINDING — 43 ACTIVE ITEMS HAVE NO DEFAULT EXPENSE ACCOUNT
Including **`Line Haul`** (`73c9a22a-86ed-4132-b8e2-fdfb1288dd2f`), `Warehouse-Lumper Fee`,
`Layover Charge`, `Sales-Detention Charge`, and every `Driver Deduction-*` item.
An item with no account cannot post. I did NOT mass-assign accounts — several of these are income
or deduction items where the account is a real decision, not a lookup.
CC-2 owns this: produce the 43-row table with a proposed account for each, then the Lead rules.
Do not guess. Do not bulk-update.

## DUPLICATE-ACCOUNT LANDMINE — EVERY SEAT
1,581 accounts, **172 numbers duplicated, 358 rows involved**, same number AND same name.
2000 A/P x3 · 2170 Net-Pay Clearing x3 · 1100 A/R x3 · QBO-168 Undeposited x3 · 2100 Escrow x2 ·
2150 Factoring Advance x2 · 1230 Factoring Reserves x2 · 6890 Cost of Labor x2.
Today all USMCA postings land on ONE id per number, so nothing is split yet. The canonical ids:
```
2000 A/P                 34d5f1f7-385f-450c-b324-927fff09d31f   (170 postings)
2170 Net-Pay Clearing    b8c4f9d4-e9db-4642-a8bc-d3ca27ea1d80   (234)
6890 Cost of Labor       fd3a69a2-7c71-41e4-89d8-d5f1f9e15c4b   (234)
1100 A/R                 11f4641f-6d83-4958-9f8b-0de94c107a70   (155)
2150 Factoring Advance   1b2568e6-7212-46d5-82ed-833161adf4bd   (383)
1230 Factoring Reserves  165cc317-5c8b-4296-8aab-f5101f4a6815   (227)
1090 Undeposited Funds   09d53946-8e22-4126-867a-d94acfea9ff3   (825)
2100 Escrow (parent)     99ce594c-5b1d-41e2-a044-80bed1d158ba   (2)
```
The DORMANT twins carry role bindings — 2170's three ids hold one binding each; the 2100 id with
ZERO postings holds TWO bindings. A poster resolving a role can pick a twin and halve A/P or escrow.
CC-1 repoints every binding to the canonical id and adds a guard that refuses a posting to a twin.
