═══════════════════════════════════════════════════════════════
BLOCK C1 — PRE-SETTLEMENTS  (groundwork the Settlements page depends on)
Phase C. Back-end / data groundwork — no financial writes yet.
═══════════════════════════════════════════════════════════════

GOAL
Lay the data + read groundwork the Settlements page (D1) needs, WITHOUT building the
financial write path yet. This de-risks D1 by getting the read model right first.

SCOPE
  - Settlement data model (read side): a settlement = a driver (or company) + pay
    period + the loads in it + the deductions applied + status (open/ready/closed/disputed).
  - MIGRATION db/migrations/<ts>_c1_pre_settlements.sql:
      schema settlement; tables: settlement, settlement_line (loads), settlement_deduction
      (links to the pending-deduction sources from A5 banking + violations + accidents
       + company-paid-fines), with status enums, is_active, audit cols, updated_at trigger.
      RLS + NULLIF pattern. "declare", no gen-col chains. Spine writes via log_event().
  - READ endpoints only (NO close/post yet):
      GET /settlements           (list, with the 4 metric-card aggregates)
      GET /settlements/:id        (one settlement + lines + deductions)
      GET /settlements/pending-deductions?driver_id=  (reuses A5 feed)
  - NO money movement, NO double-entry in this block. Pure model + reads + audit.

PRE-PUSH Postgres validate (EXIT:0). verify-pre-settlements.mjs: assert read-only
(no posting/close mutation), RLS, spine emit on any state write.
Push BLOCK_ID=C1-PRE-SETTLEMENTS, ls-remote, PR. Report PR# + SHA.
