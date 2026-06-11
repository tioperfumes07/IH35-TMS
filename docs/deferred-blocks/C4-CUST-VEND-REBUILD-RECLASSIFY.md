═══════════════════════════════════════════════════════════════
BLOCK C4 — CUST-VEND-REBUILD-RECLASSIFY
Phase C. Touches financial classification → careful + audited.
═══════════════════════════════════════════════════════════════

GOAL
Rebuild / clean the customer & vendor lists and allow reclassifying records
(e.g. an entity miscategorized as customer vs vendor, or wrong type), with every
reclassification audit-linked and QBO-consistent.

SCOPE
  - Reclassify action: move/relabel a customer↔vendor or correct its category.
    Each reclassification EMITS a spine event (category.reclassified) with before/after
    + actor + source ref — this is exactly the audit case Jorge flagged.
  - If QBO-synced, the reclassification must stay consistent with QBO (do not desync).
    Where it changes a QBO object, capture the qbo_id in the event payload.
  - MIGRATION only if columns are missing (add is_active/audit/classification fields).
    RLS + NULLIF. "declare", no gen-col chains. Spine writes via log_event().
  - Routes: reclassify, rebuild/merge-duplicates (soft, reversible), list cleanup.
  - NO destructive hard-deletes — soft-delete + audit. Reversible.
  - UI changes to existing Customers/Vendors pages → visual preview first.

PRE-PUSH Postgres validate (EXIT:0). verify-cust-vend-reclassify.mjs: assert
reclassify emits audit event; assert no hard-delete; RLS.
Push BLOCK_ID=C4-CUST-VEND-REBUILD-RECLASSIFY, ls-remote, PR. Report PR# + SHA.
