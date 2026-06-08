# IH35-TMS — Instant Load Profitability at Delivery
**LOCKED 2026-06-07**

## Purpose
The moment a load is marked Delivered, show the instant profitability calculation in the dispatch board — no waiting for settlement.

## Formula
Net Profit = Customer Rate
  − Driver Pay (delivery-date basis per VQ5)
  − Fuel Expense (fuel events for this load)
  − Maintenance/Repair (WO costs attributed to this load's unit during trip)
  − Insurance Allocation (policy premium ÷ active units ÷ days)
  − Factoring Fee (if factored)
  − Accessorials (any deductions)

## Where It Shows
- Load Detail Drawer → Settlement tab (already in P0 queue)
- Dispatch board → load card → small net profit badge after delivery
- Company Settlement Report / Trip Profitability Report (same data, trip view)

## Data Sources
All from existing tables — no new financial code. Read-only calculation.
