# OUTBOX-CURSOR

Archived 2026-10-16 — content moved to [archive/OUTBOX-CURSOR-archive-2026-10-16.md](archive/OUTBOX-CURSOR-archive-2026-10-16.md).

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

## 2026-10-23 America/Chicago · SETL-F443274-STATEMENT Settlements-Statement board SHIPPING
- BRANCH: `cursor/443274-settlements-statement-c89b` · tip base `a37a271255`
- DELTA: identity strip Company settlement EntityLink · Status Closed · paid · SettlementStatementBoardPanels 2×2 (Earnings / Deductions·net / Company side-by-side / Linked records)
- GUARD: verify-settlements-qbo-chrome-surfaces (Statement checks retargeted)
- NEXT: tsc -b + money-pr-local-gate → PR → merge → live deploy id → Settlements-PreSettlements

