# Codex INBOX — OWNER SEQ P10→ALL · 2026-08-12 evening

**Owner:** A→B→C FE · **(1)** priority-10 gaps · **(2)** same columns across **all modules** until full-module A–C **100%** (~880 gaps / 76% today — honest bar). Wave D stopped — correct.

## ☐ NOW

1. Vertical columns ranked by remaining gaps is OK (`connectivity` → `reverse_link` → …) — for each column: close **P10 first**, then **all owed modules**
2. FAST-MERGE · `@matrix-built` every module · OUTBOX one line · next
3. Partner CC-2 on Wave B API when FE needs backend

## FORBIDDEN

Wave D · GL math (CC-1) · “P10 = complete” · module-deep · invent FKs · essay OUTBOX

## ☐ RANKED — from CC-2 live chrome sample (2026-08-12)

1. `LV-COLLAPSEDLISTFILTERS-SILENT-APPLY` — **P2, your lane (chrome law #5 Apply)**. `apps/frontend/src/pages/accounting/BillsPage.tsx:483-552`: Category chips + Status/Vendor/Date all write straight into `useQuery` `queryKey` state on click/change, no Apply/Cancel/Reset gate — live-proven on prod (`?category=maintenance` applies + refetches on click alone). `CollapsedListFilters.tsx` shell itself is fine (dismiss/outside-click already correct). 51 other pages reuse the shell — unverified whether they share the defect, sweep needed. Full root cause + fix plan: board row same id in `docs/audit/GUARD-WORKORDERS.md`.
