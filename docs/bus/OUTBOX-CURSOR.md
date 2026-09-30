# OUTBOX — CURSOR — restarted 2026-09-30T11:27Z
# One entry per job id: JOB ID · what I changed · pasted live proof · what is left.
# Append below. Do not delete another seat's entries.

**2026-09-30T12:15Z · C-18 + D47..D54 ONE TOKEN PASS · PR #23385 · sha `9a935d8c59`**

C-18 · what changed: locked contrast tokens — `--color-border` → `#E5E7EB`, `--color-divider` `#D8DEE6` / `--color-divider-strong` `#C7D2DC` / row stripe/hover/selected + `--shadow-pane`; `design/qbo-parity.ts` `QBO_SURFACE`. · LIVE PROOF: `node scripts/verify-qbo-parity-tokens.mjs --selftest` → PASS; `money-pr-local-gate` → PASS. · LEFT: Chrome getComputedStyle on /customers after FE deploy.

D47 · what changed: `formatDateQboList` → `M/D/YY`; `formatDateUS` stays `MM/DD/YYYY`. · LIVE PROOF: vitest 17/17 (`9/14/26`, `07/31/2026`). · LEFT: sweep roster list columns still on `formatDateUS`.

D48 · what changed: `QBO_MONEY_CELL_CLASS` re-exported from `lib/money.ts`. · LIVE PROOF: guard + money export. · LEFT: mechanical class sweep.

D49 · what changed: `QBO_BANKING_ACTION_TEXT_CLASS` on banking Action chrome. · LIVE PROOF: guard. · LEFT: Chrome /banking font-size.

D50 · what changed: body row rule YES / vertical column rules NO (merged with tip #23381 QBO-ROWS-NOT-COLUMNS); COMPLETE-OUTLINE stays on headers. · LIVE PROOF: `verify-table-design-contract.mjs` PASS; no body `borderRight` on `tableBodyRule`. · LEFT: Chrome /customers tbody `border-right-width`=0.

D51 · what changed: header `Math.max(typography.panelHeader ?? 11, d.font + 1)` (tip #23381 + D51). · LIVE PROOF: guard asserts Math.max pattern. · LEFT: Chrome th vs td.

D52 · what changed: `FILTER_CONTROL_SIZE_CLASS` → `h-10`; height 40. · LIVE PROOF: `verify-filter-law.mjs` OK. · LEFT: Chrome filter height.

D53 · what changed: Print beside Export + gear (`parity-table-print`). · LIVE PROOF: guard. · LEFT: Chrome toolbar.

D54 · what changed: Add / Match / Record transfer via `QBO_BANKING_ACTIONS`. · LIVE PROOF: guard. · LEFT: Chrome Action labels.

Also · R-01 asserts on tip CC-2 ops AUTH-169/172/173 (gate unblock only — no Aug/Sep money work). Standing law `claude/00-AUGUST-AND-SEPTEMBER-ARE-CLOSED-NO-SEAT-TOUCHES-THEM.md` respected.

C-01..C-17 / C-19 · LEFT: inherit tokens after #23385 on tip + FE live.

GUARD: `scripts/verify-qbo-parity-tokens.mjs` PASS. No baseline raises. No seat fixtures.
