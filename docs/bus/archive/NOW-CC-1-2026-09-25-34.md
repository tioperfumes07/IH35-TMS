# ROUND 202 pivot: STEP 1 done, items a/b done, c/d/e flagged — CC-1 — 2026-09-26 01:20Z.
Prior content archived: `docs/bus/archive/NOW-CC-1-2026-09-25-33.md` (WORM).

CC-1 | ROUND 202 | numbering ruling applied, STEP 1 + items a/b live, c/d/e flagged to Lead.

**Numbering ruling applied** (owner: "already been asked and answered ... same format"): rewrote
`driver-subaccount-provision.service.ts` so 2175 mirrors the live 2100→2100-00→2100-00-NNN escrow
shape exactly (new `ensureDriverReimbursementSubParent`, sequential leaf numbering). 15/15 tests pass,
tsc clean. PR #22786 (ACCT-F2026092594), fast-merged.

**STEP 1 CONSUMED** (AUTH-044): live 2175 parent + 2175-00 sub-parent + 10 children (11th driver_uuid
collapsed by name into an existing child — the ALFONSO HIDALGO CHAVEZ duplicate-driver flag from
AUTH-044 still stands, unresolved by the owner). Full row list pasted into AUTH-044's CONSUMED block.

**Items a/b CONSUMED** (AUTH-046): two driver-paid $10.00 Honda gas lines (settlements 5805/5808,
loads 13582/13597) were confirmed live to have NO matching `accounting.expenses` row at all — created
correctly from inception (Dr 5000 Fuel & Diesel / Cr the driver's own 2175-00-NNN leaf), unlike the
existing unrelated R-185 27-row precedent which wrongly credits 1000 Bank (that repair is still R-185's
own separate, not-yet-run scope). First attempt rolled back atomically on
`expense_lines_item_qty_rate_amount_check`; fixed forward, re-ran clean. Both JEs verified live,
balanced. Full proof in AUTH-046's CONSUMED block.

**Items c/d/e — flagged to Lead, NOT run** (see AUTH-046's own text for full detail):
- c) Settlement S-5812 (LUIS ARMANDO SOSA PEREZ): zero postings exist; net_pay is genuinely negative
  (-$50, all-escrow, $0 earnings). The canonical `closeSettlementPayRun` throws `NET_PAY_NEGATIVE` for
  exactly this shape — real conflict between ROUND 202's framing (post so 2170 nets to PDF TOTAL DUE)
  and the owner's own RULING B (2026-09-01: negative settlements book to `driver_liabilities`, never a
  2170 clearing draw). No `driver_liabilities` row exists for it either. Needs an owner ruling before
  any GL write — declined to hand-roll a JE that bypasses RULING B's guard.
- d) Settlement 5792 (GENARO GUERRERO CHAVEZ): the live JE already matches the PDF exactly ($1,386.04).
  The 1-cent gap is a stale `driver_finance.driver_settlements.net_pay` header value (CC-3's lane),
  inconsistent with its own gross/deductions math — not a GL defect. Reversing a correct JE would fix
  nothing; flagged for CC-3/Lead to correct the header instead.
- e) 12 cash advances ($2,275.96/10 docs): engine identified (`linked_bill_payment_id` lives on
  `driver_finance.driver_advances`; live precedent is `cash-advances.routes.ts`'s mark-disbursed route
  — INSERT `accounting.bill_payments`, no bank row, then set `linked_bill_payment_id`). Row-level list
  not yet built — next up, no pause.

## Still open
R-187 G1 (Honda gas reimbursement, same 2175 model as a/b — now unblocked, not yet done), G3a (FLS
525/13513 factoring importer + customer-payment poster, my lane), G3b (4 invoice discrepancies vs rate
confirmations), G3c (13545/13547 W.O. cross-reference), G3e (Hummingbird/Refrigerx, report-only), G4's
escrow-discrepancy remainder (8/10, 8/12, 8/13, 8/14). R-185 steps 2-6 (repost the 27-row
driver-paid-expense list from 1000/2000 to their own 2175 children — same defect items a/b avoided by
being built correctly from the start). Item e's row-level build. ROUND 202 STEP 3 (close 5792/5812,
header-only) blocked behind c/d's rulings.

CC-1 | 01:20Z | STEP 1 + items a/b done and proofed; c/d/e are real findings needing an owner/Lead
call, not silently skipped. Continuing to item e and R-185/R-187 in order.
