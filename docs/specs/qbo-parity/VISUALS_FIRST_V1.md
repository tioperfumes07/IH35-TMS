# Visuals-First Build (V0–V4)

Captured from the build chat. Goal: build the visual pages Jorge wants first (additive, non-financial UI). Build on A1 ParityTable (merged `8f3f42a0`) + A3 drawer/sizing tokens. KEEP trucking custom fields. Every bug fix gets a static CI guard.

**Live state verified 2026-06-08 (Chrome):** `/cash-flow` = bare shell (2 empty tabs, $0 cards); `/driver-hub` = minimal (title + Requests); `/dispatch` = built (Overview/Kanban/List/Round Trips, +Book Load, Load board/Assignments/At-Risk/Detention); sidebar = 21-item rail, **no Cash Flow / Driver Hub nav links**.

## V0 — Sidebar nav entries (do FIRST; one-writer `sidebar-config.ts`)
Problem: `/cash-flow` and `/driver-hub` render live but aren't in the sidebar — only reachable by URL.
Additively INSERT two entries in `apps/frontend/src/components/layout/sidebar-config.ts`:
- "CASH FLOW" → `/cash-flow` (between ELD and ACCTG per the 23-rail target, OR adjacent to ACCTG).
- "DRIVER HUB" → `/driver-hub` (adjacent to DRIVERS).
INSERT ONLY — do not reorder/rename the other 21 (that's the separate Sidebar-V2 task). One writer on `sidebar-config.ts`. UI-only, self-merge on green.

> **OPEN DECISION (blocker):** `scripts/verify-sidebar-contract.mjs` hard-locks `eld → cash-flow → accounting` adjacent — which requires a reorder. cash-flow cannot be inserted additively "adjacent to ACCTG" without either relaxing that guard rule or a minimal reorder. driver-hub has no such constraint and inserts cleanly. Jorge to pick: (1) relax guard to "before ACCTG", (2) minimal reorder so eld→cash-flow→accounting adjacent, or (3) defer cash-flow nav to Sidebar-V2.

## V1 — Cash Flow page (`/cash-flow`)
**Why:** forward-looking daily cash position — predicted income vs expenses so Jorge sees runway before it happens. Read/projection + visual; NO posting.
Daily prediction tab: KPI cards (Expected Income · Expected Expenses · Predicted Net today + Opening balance + Projected closing balance); 7-day predicted-net strip; daily table (A1 ParityTable: Date · Predicted Income · Predicted Expenses · Predicted Net · Running projected balance). **Locked data rules:** income = GROSS `rate_confirmation_cents`; driver-pay cash line uses delivery date w/ settlement-date setting; opening + projected closing balance; 7-day strip.
Actual vs Projected tab: side-by-side Actual vs Projected income/expenses + variance; "+ Add bill or expense"; A1 ParityTable for line detail.
SEPARATE from `/reports/cash-flow-statement` and `/reports/cash-flow-overview` — never touch those. Data = existing cash-flow backend (read existing endpoints). If a needed field requires a new financial write → STOP and ask.

## V2 — Driver Hub page (`/driver-hub`)
**Why:** one place per driver — overview + quick actions + their requests + running advance/loan balance (ties to settlement engine, Block F).
Build: header (overview + quick actions); Requests section (A1 ParityTable: Date · Driver · Type · Amount · Status · Action; empty "No pending requests"); **driver advance/loan balance card per driver — DISPLAY ONLY (read Driver Cash Advance running balance, no posting)**; FAQ (keep). Any posting (approve advance → loan entry) is financial-gated — build the button disabled/stubbed with TODO, do NOT wire the write.

## V3 — Dispatch Planners (within `/dispatch`)
**Why:** forward planning — see loads/trucks/drivers across a timeline, not just Kanban/List.
Build (additive — ADD planner tab(s), do not alter existing tabs): "Planner" timeline/calendar of loads by driver/truck (rows = drivers/trucks, columns = days), drag-aware layout (UI only; scheduling logic later). Each load block: load# · lane (origin→dest) · pickup/delivery dates · driver/unit · status color. A1 grammar for list portions; filter row (driver/truck/status/date). Reuse load data feeding Kanban/List. Keep +Book Load and all existing tabs/counters.

## V4 — Apply QBO-parity grammar/sizing
All three pages use A1 ParityTable, A3 ~576px drawer for create/edit, A2 sizing tokens, inline "+Add new" ReferenceSelect for reference dropdowns. Dense desktop + 44px mobile touch targets. No full-bleed forms.

## Build order
V0 sidebar → V1 Cash Flow → V2 Driver Hub → V3 Dispatch Planner. Each its own additive UI-only PR, diff + PR# to Jorge, self-merge on green. Any write/posting need → STOP and ask (gated). Each PR: `tsc -b` + tests + mobile-responsive-audit GREEN locally before push; show `diff --staged --stat`. After each merge: report SHA.
