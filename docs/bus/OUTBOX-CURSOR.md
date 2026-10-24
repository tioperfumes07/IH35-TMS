# OUTBOX-CURSOR

Archived 2026-10-16 — content moved to [archive/OUTBOX-CURSOR-archive-2026-10-16.md](archive/OUTBOX-CURSOR-archive-2026-10-16.md).

## 2026-10-23 7:12 PM CT · CURSOR LEAD · GO-20 hook (post subagent · tip refresh)
- **SYNC:** `origin/main` = **`4de41cdef4`** · **#27398** SETL-F443282-FUEL merged (module **`/fuel/…`** layout/shell) · prior **`c760e2ef13`** (#27393 Company Settlements)
- **INBOX-CURSOR / CC-1 / CC-2:** archived 2026-10-13 — coordinate only via **LEAD-PENDING-REGISTER** + OUTBOX (no GUARD-WORKORDERS / no Downloads/abb)
- **443.282 FUEL:** **MERGED** — squash on main **`4de41cdef4`** · Live **MERGED-UNVERIFIED** until ih35-tms-web deploy + Chrome · register **55–56** + **#114** stay open until measured at deployed FE sha
- **LIVE backend:** healthz shallow **`git_sha` `c760e2ef13`** (catching up to **`4de41cdef4`**)
- **OPEN PRs (443282 fuel):** **0** (landed #27398) · stale local branches **`cursor/443282-fuel-ship-b690`** / remote **`cursor/443282-fuel-boards-c89b`** — ignore after merge
- **COORDINATE ONLY:** CC-2 **#113** Plaid pending/posted · CC-1 **#91–92** CF AvP / Faro rolling ledger
- **NEXT Cursor:** ih35-tms-web deploy proof for **`4de41cdef4`** → Chrome Fuel Home + By truck · then next **443.280** board row (CF Rolling/Manual, Factoring Home, Settlements Close/Escrow, … per register)

## 2026-10-23 01:00 CDT — CURSOR → LEAD | 443.250 HOME-SLICE SHIPPED (not full DONE)

PR #27253 squash `b0fda815e20b98ec0626b3d9351fd4fbb0610380` · preflight EXIT 0 · verify-cash-flow-home-tab selftest 6/6 · verify-cash-flow-rolling-ledger selftest 24/24 + LIVE OK · design-tokens problems:[] · shared `components/v3` + Home chart/13-week table from live `getRollingLedger` · Chrome UNVERIFIED · Files Modified: v3-tokens · components/v3/{V3KpiTile,V3Panel,V3Segmented,index} · CashFlowHomeTab · CashFlowKpiStrip · verify-cash-flow-home-tab · verify-cash-flow-rolling-ledger · MEMORY_BANK · NEXT Cash Flow Projected V3 (remaining 443.250 boards; hard stop 10-26 18:00Z).

## 2026-10-22 22:05 CDT — CURSOR → LEAD | 443.256 DONE

PR #27241 squash `17467838a8c2a0899c62d36b2b6c37a311922289` · gate exit 0 · verify-truck-line-board --selftest 22/22 · vitest statusCombobox 4/4 · Combobox On-time station live on tip · Chrome GIF UNVERIFIED (no display capture) · NEXT idle — no Cursor row open after 256 (CC-1/CODEX on 443.259 merge wave).

## 2026-10-22 21:38 CDT — CURSOR → LEAD | 443.258-B DONE

PR #27239 squash `0512ef14cddbafa7de6eeabc2586d5fe152f25d0` · healthz git_sha match · FE `assets/index-BO4wDyFW.js` carries `formatPersonName` + `fuel-assignment-questions` · Chrome screenshots UNVERIFIED (no display capture / browser MCP) · proof `docs/bus/proof/443258/PROOF.md` · NEXT 443.256 Truck Line On-time Combobox.
## 2026-10-23 America/Chicago · RPT-F443267-8 Trial balance viewer board DONE
- MERGE: #27328 squash `cdbe0823e68c1f7118c754d7265df0821470c8ac`
- RENDER ih35-tms-web: **live** deploy id `dep-dbdnbelbedkc73d84psg` (commit cdbe0823e6)
- PRE-MERGE: `cd apps/frontend && npx tsc -b` EXIT 0 · `node scripts/money-pr-local-gate.mjs` EXIT 0
- NEXT: 443.267 re-do CashFlow → Settlements → Fuel to boards (not chrome-only)

## 2026-10-23 America/Chicago · CF-F443267-HOME Cash Flow Home board DONE
- MERGE: #27330 squash `dc120aa6636030e2934272558c5dff2824e7e7a5`
- RENDER ih35-tms-web: **live** deploy id `dep-dbdnheh42hec739e0mf0` (commit dc120aa663)
- PRE-MERGE: `cd apps/frontend && npx tsc -b` EXIT 0 · `node scripts/money-pr-local-gate.mjs` EXIT 0
- NEXT: 443.267 Settlements Home board → Fuel boards

## 2026-10-23 America/Chicago · SETL-F443274-OPEN Settlements-Open board DONE
- MERGE: #27337 squash `c94e69d9e6b9099001fd77985381d5c6a6f34c53`
- RENDER ih35-tms-web: **live** deploy id `dep-dbdrkuui0phs73befbf0` (commit c94e69d9e6; later tip supersedes; Open code on main)
- PRE-MERGE: `cd apps/frontend && npx tsc -b` EXIT 0 · `node scripts/money-pr-local-gate.mjs` EXIT 0
- GUARD: verify-settlements-module-one-readout --selftest 26/26 (Open slice)
- NEXT: 443.274-C Settlements-Closed → Statement → … → Fuel → Cash Flow tabs (never CashFlowHomeTab.tsx)

## 2026-10-23 America/Chicago · SETL-F443274-CLOSED Settlements-Closed board DONE
- MERGE: #27341 squash `92ce5bf70dfc464838a9d6dc5cdf7d48ae179229`
- RENDER ih35-tms-web: deploy id `dep-dbdrqkei0phs73benkh0` went **live** (Closed sha); tip now `dep-dbdrrhok84hc73eb8kj0` live (Lead CF Home a37a271255; Closed code remains on main)
- PRE-MERGE: `cd apps/frontend && npx tsc -b` EXIT 0 · `node scripts/money-pr-local-gate.mjs` EXIT 0
- GUARD: verify-settlements-module-one-readout --selftest 30/30
- NEXT: 443.274-C Settlements-Statement → PreSettlements → … → Fuel → Cash Flow tabs (never CashFlowHomeTab.tsx)

## 2026-10-23 America/Chicago · SETL-F443274-STATEMENT Settlements-Statement board DONE
- MERGE: #27347 squash `c758d20ded…` · RENDER ih35-tms-web live `dep-dbds300u01pc73dselsg`
- NEXT was PreSettlements (this row)

## 2026-10-23 America/Chicago · SETL-F443274-PRESETTLE Settlements-PreSettlements board DONE
- MERGE: #27349 squash `69773d209646b6d168eec9b2b787fe538351b7e6`
- RENDER ih35-tms-web: **live** deploy id `dep-dbdsak61egvs73f7pvgg` (commit 69773d2096)
- PRE-MERGE: `cd apps/frontend && ./node_modules/.bin/tsc -b` EXIT 0 · `node scripts/money-pr-local-gate.mjs` EXIT 0 · vitest PreSettlementsPanel 7/7
- GUARD: verify-settlements-qbo-chrome-surfaces (PreSettle board asserts)
- NEXT: 443.274-C Settlements-Close → Company → Deductions → CashAdvances → Escrow → EscrowRegister → Fuel → Cash Flow tabs (never CashFlowHomeTab.tsx)

## 2026-10-23 America/Chicago · SETL-F443274-CLOSE Settlements-Close board DONE
- MERGE: #27351 squash `c081694f31`
- RENDER ih35-tms-web: **live** deploy id `dep-dbdsju3m8hqs73cunhe0` (commit c081694f31)
- PRE-MERGE: `cd apps/frontend && ./node_modules/.bin/tsc -b` EXIT 0 · `node scripts/money-pr-local-gate.mjs` EXIT 0
- GUARD: verify-settlements-qbo-chrome-surfaces (Close board asserts)
- NEXT: 443.274-C Settlements-Company → Deductions → CashAdvances → Escrow → EscrowRegister → Fuel → Cash Flow tabs (never CashFlowHomeTab.tsx)

## 2026-10-23 America/Chicago · SETL-F443274-COMPANY Settlements-Company board DONE
- PR: #27354 · squash `e8a9f02bc7`
- RENDER ih35-tms-web: **live** deploy id `dep-dbdssda8sjds73f8vdh0` (commit e8a9f02bc7)
- PRE-MERGE: `cd apps/frontend && ./node_modules/.bin/tsc -b` EXIT 0 · `node scripts/money-pr-local-gate.mjs` EXIT 0
- GUARD: verify-settlements-qbo-chrome-surfaces (+4 Company asserts)
- NEXT: 443.274-C Settlements-Deductions → CashAdvances → Escrow → EscrowRegister → Fuel → Cash Flow tabs (never CashFlowHomeTab.tsx)

## 2026-10-23 America/Chicago · SETL-F443274-DEDUCTIONS Settlements-Deductions board DONE
- PR: #27355 · squash `5444d6ccf3`
- RENDER ih35-tms-web: **live** deploy id `dep-dbdt0u0473hc73bgqd9g` (commit 5444d6ccf3)
- PRE-MERGE: `cd apps/frontend && ./node_modules/.bin/tsc -b` EXIT 0 · `node scripts/money-pr-local-gate.mjs` EXIT 0
- GUARD: verify-drivers-deductions-tab-distinct (+board 2col / Escrow·Advances·Fines·Damages / New deduction asserts)
- NEXT: 443.274-C Settlements-CashAdvances → Escrow → EscrowRegister → Fuel → Cash Flow tabs (never CashFlowHomeTab.tsx)

## 2026-10-23 America/Chicago · SETL-F443274-CASHADVANCES Settlements-CashAdvances board SHIPPING
- BRANCH: `cursor/443274-settlements-cashadvances-c89b` · tip base `6b9b2dc0c1` (Deductions live)
- DELTA: CashAdvancesKpiRow → board KPIs (Advances on file · Requests awaiting owner · Outstanding to recover · Recovered this period) + 1fr|2fr Requests|Advances panels + footnote; Requests cols Driver·Asked·Amount·Policy·Action; Advances cols Advance·Driver·Paid·Method·Amount·Outstanding·Recover on; engines getCashAdvancesKpis / listCashAdvances / cashAdvanceRequestsOfficeApi.listPending; ParityTable + NavyPageSubNav retained for guards
- PRE-MERGE: `cd apps/frontend && ./node_modules/.bin/tsc -b` EXIT 0 · `node scripts/money-pr-local-gate.mjs` EXIT 0
- GUARD: verify-cash-advances-tabs-url-sync --selftest PASS (8 + V3 KPI + 443.274-C board markers)
- NEXT: tsc -b + money-pr-local-gate → PR → merge → live deploy id → Settlements-Escrow

