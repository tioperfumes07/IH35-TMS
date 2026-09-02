AGENT-1 · Block <N> of <M> — PHASE <tracker-phase> / TASK <set-from-latest-IH35TMSMASTERTRACKER-before-dispatch> — Cash Flow page: daily prediction + Actual vs Projected report
RBC TARGET: branch feat/cash-flow-daily-prediction  (open PR after first push)

[!] TASK ID: do NOT dispatch until a real tracker task-ID is set. Add the tracker row first if new. Malformed header = recall.

STANDING ORDERS: foreground only, no subagents; no retries — STOP, paste exact error; live updates every 5 min with CST/Laredo timestamp + real measured data, no guesses; confirm worktree pwd, git status, log, rev-parse; show diff --staged --stat before commit; stop on unexpected.

LOCKS:
- ADDITIVE ONLY. New page + new sidebar item. Remove nothing, reorder nothing.
- Vocabulary "+ Create"/"+ Book"; here "+ Add bill or expense" is the inline input label (allowed; not a + New/+ Add button-create of a record type).
- All financial reads/writes through EXISTING accounting + driver_finance services. NO new financial code/tables for money flows; manual add-in rows persist in a dedicated cash_flow adjustments table (additive), audit-logged.
- RESPOND-BEFORE-CODE (RULE 6): reply first with what exists vs spec, screens/blueprint matched, deltas, NEW spec. Wait for GO.

LANE LOCK — sidebar-config.ts is a magnet file: coordinate with the Insurance block (they both touch it). One writer per cycle. If Insurance block is in-flight on sidebar-config.ts, SEQUENCE after it (do not edit concurrently). Do NOT touch verify-pre-commit.mjs, App.tsx beyond adding the /cash-flow route, accounting/index.ts, backend index.ts.

SCOPE (additive):
1. Sidebar: insert "cash-flow" (label CASH FLOW) BETWEEN eld and accounting in SIDEBAR_DEFAULT_ORDER + role orders (owner/office_admin/accountant). Bump verify-architectural-design.ts module count.
2. Page /cash-flow, tab "Daily prediction":
   - Date navigator (prev/selected/next/Today).
   - KPI row: Expected income · Expected expenses · Predicted net (green>=0 / red<0).
   - Income panel: rows from loads DELIVERING on date (load#, customer, delivery time, amount, basis tag Confirmed|Predicted|Adjustment); subtotal. Amount basis = rate-confirmation gross (default; see toggle 1).
   - Expenses panel: driver pay accrued on delivery (per delivering load), bills due that day (incl insurance scheduled bills, fuel, factoring), manual add-ins; subtotal.
   - Inline "+ Add bill or expense" (label+amount+Add) -> persists date-scoped adjustment, recomputes net live, audit.
   - Net bar.
3. Tab "Actual vs Projected":
   - Date or range picker; per line PROJECTED vs ACTUAL vs VARIANCE ($ and %); income, expenses, net; accuracy summary.
   - Actuals from invoices/payments, bills/bill_payments, settlements posted_at. Respect accrual/cash (VQ7 default Accrual).
4. CI guard: assert sidebar contains cash-flow between eld and accounting; assert prediction net = income_subtotal - expense_subtotal (unit test); assert A-vs-P variance = actual - projected.

OPEN TOGGLES — confirm with Jorge in RESPOND-BEFORE-CODE (do not hardcode silently):
  (1) predicted invoice = gross rate-conf [default] vs net-of-factoring.
  (2) driver pay cash line = delivery date [default] vs settlement date (VQ5). Provide setting.
  (3) opening cash + projected closing balance (add?).
  (4) 7-day predicted-net strip (add?).

GATES (Std Order #16 v2): build:backend EMIT, frontend tsc -b, verify:arch-design, full backend vitest for the prediction + A-vs-P calc paths, migrations self-contained w/ GRANTs + drift-capture (CI is fresh-DB). verify+commit+push as ONE step.

ACCEPTANCE: page renders both tabs; income/expense logic per spec; live net; A-vs-P variance + accuracy; manual add-in persists + audit; nothing removed; guards green.

PAUSE after RESPOND-BEFORE-CODE for GO. PAUSE before merge — Claude verifies live (page between ELD and ACCTG, prediction + report) before GO.
