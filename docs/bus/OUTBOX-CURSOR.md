# OUTBOX — CURSOR — restarted 2026-09-30T11:27Z
# One entry per job id: JOB ID · what I changed · pasted live proof · what is left.
# Append below. Do not delete another seat's entries.

**2026-09-30T11:45Z · C-18 + D47..D54 ONE TOKEN PASS (in flight on `cursor/c18-d47-d54-tokens-c89b`)**

C-18 · what changed: locked contrast tokens — `--color-border` `#E3E8EF`→`#E5E7EB`, added `--color-divider` `#D8DEE6` / `--color-divider-strong` `#C7D2DC` / `--color-row-stripe` / `--shadow-pane`; `colors.cardBorder` matches; `design/qbo-parity.ts` `QBO_SURFACE` is the shared surface/edge/row token. · LIVE PROOF (static, tip of this branch): `node scripts/verify-qbo-parity-tokens.mjs` → `OK — C-18 + D47..D54 tokens present and wired`; `node scripts/verify-table-design-contract.mjs` → `PASS`. · LEFT: Chrome getComputedStyle on /customers panes after FE deploy (border/background before→after).

D47 · what changed: `formatDateQboList` → `M/D/YY` (list); `formatDateUS` stays `MM/DD/YYYY` (banking/forms); `DATE_PLACEHOLDER_QBO_LIST`; policy in `design/qbo-parity.ts` `QBO_DATE`. · LIVE PROOF: vitest `formatDate.test.ts` — `formatDateQboList("2026-09-14")` = `9/14/26`; `formatDateUS("2026-07-31")` = `07/31/2026` (17/17 pass). · LEFT: sweep list columns that still call `formatDateUS` to `formatDateQboList` where the surface is a transaction/roster list (not banking).

D48 · what changed: `QBO_MONEY_CELL_CLASS = "text-right tabular-nums"` in `qbo-parity.ts`, re-exported from `lib/money.ts`; string shape already `$5,500.00` via `formatUsd*`. · LIVE PROOF: money.test + guard asserts export. · LEFT: audit columns missing the class (mechanical sweep next).

D49 · what changed: `QBO_BANKING_ACTION_TEXT_CLASS = "text-xs leading-5 text-[#1A2233]"` wired on Banking action-type chip + Add/Match buttons (was `text-[11px]`). · LIVE PROOF: source wired + guard. · LEFT: Chrome measure Action column font-size on /banking after deploy.

D50 · what changed: ParityTable dual-mode — default lists = row separator YES / vertical column rules NO; `columnGroups` (Load Costs) keeps DESIGN-CONTRACT complete outline + body `tableBodyRule` right borders. · LIVE PROOF: `verify-table-design-contract.mjs` PASS (grid path still asserts outline + body right rule); `useGridColumnRules` present. · LEFT: Chrome on /customers tbody td `border-right-width` = 0px and `border-bottom-color` = `#D8DEE6`.

D51 · what changed: header `fontSize: qboHeaderFontPx(d.font)` = row font + 1 (was `typography.panelHeader` 11 vs body 12 — header was smaller). · LIVE PROOF: guard asserts `qboHeaderFontPx(d.font)`. · LEFT: Chrome th vs td font-size on /customers.

D52 · what changed: `FILTER_CONTROL_SIZE_CLASS` `h-9`→`h-10 min-w-[10rem]`; `spacing.filterControlHeight` 36→40; `verify-filter-law.mjs` updated to h-10. · LIVE PROOF: `verify-filter-law.mjs` OK + SELFTEST 7/7. · LEFT: Chrome measure filter control height on /customers (was 33px).

D53 · what changed: ParityTable toolbar always mounts Print (`parity-table-print` + lucide Printer) beside Export + gear (`QBO_TOOLBAR_ICON_SLOT`). · LIVE PROOF: source `data-testid="parity-table-print"` + guard. · LEFT: Chrome toolbar screenshot after deploy.

D54 · what changed: Banking labels use `QBO_BANKING_ACTIONS` — Add / Match / Record transfer (categorize mode label → Add; Transfer option text → Record transfer). Posters unchanged. · LIVE PROOF: guard asserts Add + recordTransfer wired in BankingTransactionsDesignView. · LEFT: Chrome Action column labels on /banking.

C-01..C-17 / C-19 · LEFT: inherit these tokens next — do not start page jobs until this PR is on tip + FE live. Prior C-shell WIP stashed on `cursor/c17-drivers-master-detail-a283` (`stash: c17-wip-aside-for-c18`); rebase after this lands.

GUARD: `scripts/verify-qbo-parity-tokens.mjs` (local PASS; CLAIM+verify-step wire still open — Rule 37). No baseline raises. No seat fixtures.
