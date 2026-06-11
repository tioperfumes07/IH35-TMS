═══════════════════════════════════════════════════════════════════════════════
IH35-TMS — MASTER DEFERRED ITEMS REGISTER
Everything deferred across the project, in the order it should be built.
Generated: 2026-06-11. Keep this file — it is the source of truth for "what's left."
═══════════════════════════════════════════════════════════════════════════════

HOW TO USE THIS
  - Each item below is a self-contained block with full instructions, in its own file.
  - Build ONE block at a time. Merge + deploy-green-audit BEFORE building the next.
  - Paste each block into the AGENT window (not the editor box).
  - All migrations go in db/migrations/ ONLY, timestamped, validated on real Postgres
    pre-push. Spine writes via events.log_event() only. Keep ALL ci.yml verify lines.
  - After each merge, AUDIT the deploy landed GREEN in the CORRECT Render service
    (backend IH35-TMS srv-d7rpem7avr4c73fhp4n0 / frontend ih35-tms-web / driver PWA).
  - WE ALWAYS FIX, NEVER DEFER a real defect — "deferred" here means scheduled work,
    never a weakened guard or a skipped gate.

═══════════════════════════════════════════════════════════════════════════════
CURRENT STATUS (as of 2026-06-11)
═══════════════════════════════════════════════════════════════════════════════
DONE + DEPLOYED GREEN:
  ✅ #878 deploy-fix · #877 W3-A geofence · #879 W3-B forced-driver-ack
  ✅ #880 W4-A signed-safety-docs · #881 W4-B broker-auto-update
  (Waves 1, 2, 3, 4 complete)

NEXT IMMEDIATE (already queued, not in this register):
  ▢ W5 TIME-UTILIZATION — last wave block (read-only capstone). Build after W4-B
    deploy confirmed green. Already written/queued to the agent.

AFTER W5 → this register begins.

═══════════════════════════════════════════════════════════════════════════════
EXECUTION ORDER — DEFERRED PHASES
═══════════════════════════════════════════════════════════════════════════════

PHASE A — UNIVERSAL AUDIT LINKAGE  (do FIRST after W5 — everything else links to it)
  A0  AUDIT-LINKAGE-ARCHITECTURE   (read first — the principle + rules)
  A1  AUDIT-SPINE-LINK-COLUMNS      (DB foundation: source_table/source_reference_id)
  A2  AUDIT-EMIT-COVERAGE-DISPATCH
  A3  AUDIT-EMIT-COVERAGE-MAINT     (+ driver-reported-failure accept/defer/approve/worked)
  A4  AUDIT-EMIT-COVERAGE-ACCOUNTING
  A5  AUDIT-EMIT-COVERAGE-BANKING   (also feeds Settlements pending-deductions)
  A6  AUDIT-UNIVERSAL-VIEW          (read API + universal Audit Trail page)
  A7  AUDIT-PER-ENTITY-TABS         (Audit tab on vehicle/load/driver/invoice/bill — preview-gated)
  A8  AUDIT-REPORTS-SECTION         (Reports → Audit)
  A9  AUDIT-CI-EMIT-GUARD           (CI gate: mutating endpoint must emit — locks coverage)
  → full blocks in the AUDIT-LINKAGE zip already delivered; summarized here for order.

PHASE B — UI / VISUAL CLEANUP  (QBO-style; existing pages → visual preview first)
  B1  UI-DEFECTS-BATCH             (8 visual bugs: currency 4800→48.00, card sizing,
                                    dropdowns not auto-closing, blank driver names,
                                    load-reserve-without-unit, + rest)
  B2  RETURN-ARROW-ALL-PAGES       (consistent back-arrow nav on every page)

PHASE C — BUILD / DATA BLOCKS
  C1  PRE-SETTLEMENTS              (groundwork the Settlements page depends on)
  C2  FACTORING-PROFILE
  C3  CUSTOMER-CONTRACT-UPLOAD
  C4  CUST-VEND-REBUILD-RECLASSIFY

PHASE D — FINANCIAL (max rigor · double-entry · GATED on explicit OK · needs QBO capture)
  D1  SETTLEMENTS-PAGE ★           (replaces Payroll tab #26; between Cash Flow &
                                    Accounting; Payroll becomes future sub-tab under it;
                                    pending-deductions approve/defer model. Needs A1+A5.)
  D2  TXN-EDITORS (7)              (the 7 transaction editors; each gated separately)

PHASE E — FINAL
  E1  SMOKE-SERVICE-TOKEN-AUTH     (final hardening/smoke)

═══════════════════════════════════════════════════════════════════════════════
DEPENDENCY NOTES
═══════════════════════════════════════════════════════════════════════════════
  - D1 Settlements REQUIRES A1 (spine link columns) + A5 (banking driver-tag feed)
    + a LIVE QBO CAPTURE of current driver-settlement & bill-payment screens.
  - A7/A8 reuse A6's read API — A6 must merge first.
  - A9 should land AFTER A2–A5 emit coverage, so the guard passes on real coverage.
  - B-phase UI changes to existing pages need a visual preview approved before dispatch.
  - All D-phase write paths are GATED — do not enable writes without Jorge's explicit OK.
═══════════════════════════════════════════════════════════════════════════════
