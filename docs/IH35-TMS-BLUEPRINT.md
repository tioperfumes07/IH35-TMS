# IH35-TMS — Build Blueprint

> ⚠️ **SUPERSEDED (2026-06-27).** This file is from 2026-06-15 and is stale. The live, verified
> current-state architecture **and** blueprint is **`docs/IH35-TMS-ARCHITECTURE-AND-BLUEPRINT.md`**
> (measured build state: 467 blocks, 420 DONE). Kept for history (archive, never delete).

_The build plan, module specs, current state, and the locked process rules. Pairs with the Architecture document._

---

## 1. Phase roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 | Foundation — auth, sessions, audit substrate, outbox, R2 wiring | ✅ Done, live |
| 1 | Identity + Master Data + Catalogs | ✅ Done, live |
| 2 | Documents module + Notifications dispatcher | ✅ Done, live |
| 3 | **Module UI build** — Dispatch, Maintenance, Driver Finance, Banking, Accounting, Fuel, Drivers, Lists, Reports, Home, 425C, Driver PWA | **🟡 In progress** |
| 4 | Live Samsara wiring (real GPS / HOS / ETA) | Pending |
| 5 | Live QBO sync (customers, vendors, chart of accounts, bills/payments) | Pending |
| 6 | Integrity / alert engine | Pending |
| 7 | Cutover + production launch (backup/DR, production credentials) | Pending |
| 8+ | SaaS productization (future vision — multi-tenant already foundational) | Future |

**Current work:** Phase 3 module UI. The active sub-cycle is design-finalization of the remaining modules before Cursor builds them — see §7.

## 2. The 12 modules — spec & status

Sidebar order is fixed: `HOME · MAINT · ACCTG · BANK · FUEL · SAFETY · DRIVERS · DISPATCH · LISTS · REPORTS · 425C · DRV APP`.

### HOME — ✅ accepted
7 KPIs in one row; 8 section quick-jumps with new-in-3-days badges; "Today's Attention List" (~60% left, severity-pilled); "Fleet Snapshot" (~40% right).

### MAINTENANCE — ✅ accepted
Sub-nav: Maintenance · Work orders · R&M status · Service/location · Severe repair/OOS · In-transit issues · Fleet table.
KPI row (30px): Open WOs · Past Due · Avg Close · Open $ · Tire Alerts · PM 30d · DOT 60d.
Three-bucket R&M status (In-house shop / External shop / Roadside) · Severe Repair / OOS band (red) · In-Transit Issues band (gold — driver-reported repairs/damages/late from the PWA → convert to WO or Damage Report).

**Create Work Order form — ⚠️ layout fix pending.** Unified form, 4 types (PM · Repair · Tire · Accident). "Work Order Details" 12×6 header grid → "Where & How" block (Location: External shop / Internal shop / Roadside / Internal tires / External tires; Payment Timing radios → Expense / Bill / no-post; bill terms) → **Cost Breakdown Box (correct — do not change)** → Totals Stack. The field order/grouping must be rebuilt to match the locked master-rules Excel.

### ACCOUNTING — ✅ accepted, **LOCKED**
Bills, expenses, journal entries, **Receive Payment** (payments live here — there is no separate "Pay" module), financial reporting. Manual JE is a WF-064 high-risk action.

### BANK — ✅ accepted
Approved Transactions page: Accounts / Transactions / Reconciliation / Driver Escrow / Reports tabs · account chips · For review / Categorized / Excluded sub-tabs · transaction table with month groupings · click-to-expand Match/Categorize detail panel.

### FUEL — ⚠️ to be built
Sub-nav: Home · Planner · Relay inbox · Settings · Expense mapping · History & savings.
Planner: active-trip strip · HOS-aware route diagram (state-priced fuel stops — green recommended cheap-state fills, gold strategic fill, red avoid-states) · Trip Plan Summary panel · HOS-aware stop-logic panel (FMCSA 11/14/70) · Recommendation-vs-Actual driver-compliance panel.

### SAFETY — ✅ accepted (use the version in the system)
Driver files, hours & fatigue, inspections & FMCSA, accidents & claims, fines & discipline, compliance docs.

### DRIVERS — ⚠️ to be built
Sub-nav: Drivers · Profiles · Settlements · Pre-settlements · Cash advances · Permits · Pay rate templates · Deductions · Leave.
KPI row (7): Active · On Loads · Available · On Leave · Settle Due · Drivers Owe · Escrow.
Four uniform 2×2 panels: Settlements Ready · Debt Alert (before any payment) · Active Drivers (Samsara live) · Permit/Document Expirations. Settlement screen has live debt recompute + red debt banner + acknowledgment lock + 5-second stale-debt lockout. Cash advance flow: within-policy standard, above-policy Owner-only (WF-064).

### DISPATCH — ✅ accepted (use the version in the system)
Sub-nav: Dispatch · Loads · Northbound · Southbound · By trailer · Cash advances · Pre-settlements · Settlements · Geofence map · Incidents · Factoring packets.
7 KPIs · Units With A Load table (Load# · Unit · Trailer · WO · Temp · Driver · Start · End · Customer · Origin→Destination · Status) · Units Without A Load table · Book Load modal (4 banded sections).

### LISTS — ✅ accepted
Lists & Catalogs hub — master reference data.

### REPORTS — ✅ accepted
Report library with hover-dropdown category nav · scheduled/auto-emailed reports · IFTA quarterly preparer (4-step, WF-064).

### 425C — ✅ accepted (do not touch)
Form 425C monthly generation.

### DRV APP — ✅ accepted (do not touch)
The driver PWA surface.

## 3. Universal components — status

| Component | Status |
|---|---|
| Cost Breakdown Box (Section A + Section B + Parts/Labor) | ✅ Correct |
| Totals Stack (Subtotal / Tax / grand total) | ✅ Correct |
| 12×6 Header Grid | 🟡 Used; WO field placement must match the Excel |
| **Combobox** (autofill-filter, every list-picking field) | ⚠️ Locked standard; **must be applied app-wide** — see §7 |

## 4. Workflow catalog

The system implements a numbered workflow catalog (WF-001 … WF-064+). Examples: WF-001..WF-005 maintenance work-order creation, WF-011/WF-012/WF-041 settlement lifecycle, WF-017 single-active-factoring invariant, WF-019 IFTA, WF-020 Form 425C, WF-024 RBAC, WF-048/WF-049 in-transit-issue → work-order, WF-050 DVIR, WF-064 high-risk-action envelope. Each Cursor block references the WFs it implements; new work cites its WFs in the tracker.

## 5. Standing orders (locked process rules)

These are not optional. They exist because breaking them has cost real rework.

1. **Designs already exist — never build from memory.** Jorge's approved designs live in the project knowledge base and the repo. Search and read them first; build to them. (See the Agent Handoff.)
2. **Ship discipline (#16):** Cursor work is not "shipped" until `git push` returns success and the remote commit hash equals local `HEAD`. No pause-for-approval before commit.
3. **Verification:** the authoritative checks are backend `npm run build:backend` (EMIT) + frontend `cd apps/frontend && npx tsc -b`. Local `npm run typecheck` (`--noEmit`) is **not** sufficient.
4. **Root-cause only.** No patches, shortcuts, or skips. Every bug fix includes a static CI guard that prevents the bug class from recurring.
5. **Never skip CI.** Never propose skipping a CI check.
6. **Never baseline-snapshot** the migration chain until it is honest end-to-end.
7. **Never remove a real module / section / tab / route / button.** Hide, flag, or archive instead. Adding is allowed.
8. **Pre-flight inspection** before every Cursor block — Cursor inspects the relevant files and pastes findings; Jorge confirms before code is written.
9. **"Ready" is a status report, not a deliverable.** When Cursor says "done", wait for the cross-check pause and the paste-back of commit hash + diff stat + verification output.
10. **Credentials never in chat.** Render env vars only.
11. **Tracker discipline:** every architectural deviation gets a Section E entry in `docs/trackers/phase-X.md`.
12. **Role split (#13):** Jorge runs `git push` and pastes; Cursor writes code; Claude does GitHub PR ops, the Render dashboard, and Neon SQL via the browser.

### 5a. Bank reconciliation — match laws

**Bank reconciliation — match laws (owner, 2026-10-16; source of truth: [docs/registers/00-MASTER-ENGINE-REGISTER-READ-FIRST.md](registers/00-MASTER-ENGINE-REGISTER-READ-FIRST.md) Part 1 + M1/M1b/M1c/M2):**
- **One engine.** Candidates come only from `apps/backend/src/accounting/bank-recon/match.service.ts` (`findCandidates()` → `fetchLedgerCandidates()`); guard `verify-one-match-engine-owns-this-surface`.
- **1.2 Match vs Categorize (QuickBooks split).** MATCH links the bank line to an EXISTING document — no new journal entry. CATEGORIZE posts a NEW journal entry from the line — no document; a categorized line carries a vendor. Categorizing to A/R or A/P control is disallowed; re-match / re-categorize reverse through `reversePostedSourceTransaction`, never the void path (CHAIN-05 :130, :236, :237).
- **1.3 Never auto-match.** `findCandidates()` is read-only: it suggests and ranks with the reason; the owner accepts every match. No auto-accept, no matching in a cron (guards `verify-no-automatch`, `verify-bank-match-is-never-auto-written`, `verify-banking-suggest-matches-wired`).
- **1.4 The candidate universe is every document** the company creates — A/R invoices, receive-payments, deposits, vendor expenses, bills, bill payments, transfers, journal entries, factoring purchases (owner ruling 2026-09-30).
- **M1 Same-account scope.** A candidate belongs to the bank line's own account: paid from / deposited to / posted to that account's ledger, or an open clearing item that lands in an operating bank (undeposited receipts, a Faro purchase net, an open invoice or settlement bill). A Relay deposit is offered only on the Relay Fuel Wallet. No cross-account candidate, ever.
- **M2 Invoices and factoring purchases are in the union** (money-in, operating bank). A Faro wire equals one purchase's net, or the sum of the purchases sharing its date; it is matched through the existing `factoring_advance` accept — the purchase is never re-posted. An open invoice is view-only (settle it with its receive-payment, then match that).
- **M1b Consumed documents are excluded.** A document already matched to a live bank line (or born from another bank line) is never offered to another line; a partly-open bill / invoice stays a candidate while its open amount is > 0.
- **M1c Relevance floor.** On the default search a document is offered only when its amount is within the resolve-difference tolerance (Q11: max $1.00, 0.01%; on a card register the 8% card-discount cap) OR it resembles the line (similarity = max(memo, description, payee tokens) ≥ 0.5, calibrated 2026-09-06). An explicit filter (dates, search, payee, kinds, amount) is the owner searching and has no floor.
- **M3 One matcher on screen / M5 filters.** Categorize / Match embeds `MatchDrawer.tsx` as its match side (many-to-one, Resolve difference); no second candidate table exists in the banking view. Its QuickBooks Find-match filters — type (kinds), Payee, Amount from / to, date From / To — go to the one engine; each row shows Date · Type · Ref no. · Payee · Description · Open balance · Amount · Difference · Days off.
Guards: `scripts/verify-banking-match-qbo-engine.mjs` + `scripts/verify-banking-categorize-boxes.mjs` (each `--selftest`).

## 6. Known carryovers / open items

- **Migration drift:** ~187 migrations had drift across 6 bug classes. Fixes are root-caused with CI guards added (`verify-canonical-schema-names.mjs` live). Do not baseline the chain until it is honest.
- Phase 4 (Samsara) and Phase 5 (QBO sync) wiring is stubbed pending those phases.
- Production launch items (backup/DR, production QBO credentials) belong to Phase 7.

## 7. Current design-cycle deliverables

The active sub-cycle finalizes the remaining Phase 3 module designs and hands them to Cursor.

**Done:**
- Integrated clickable prototype of the office product (`ih35-tms-prototype.html`).
- Approved standalone designs: Banking Transactions page, Book Load wizard.

**Handed to Cursor (instruction block `CURSOR-INSTRUCTIONS-WO-Combobox-Fuel-Drivers.md`):**
1. Rebuild the Create Work Order form layout to match the locked master-rules Excel.
2. Apply the autofill-filter Combobox to **every** list-picking field, app-wide.
3. Build the **Fuel** section.
4. Build the **Drivers** section.

**Explicitly out of scope of that block / not to be touched:** Maintenance, Dispatch, Home, Safety, Accounting, Bank, Factoring, Lists, Reports, 425C, ELD, Driver PWA.

---

_For the system structure see the Architecture document; for how to work on this project without repeating past mistakes, read the Agent Handoff._
