# IH35-TMS — NEW LEAD HANDOFF (Cursor = Lead, Codex = coder) — 10-26-2026 12:05 AM CT
Written by the outgoing Claude Lead (weekly usage limit reached; resets Oct 29 6 PM CT).
USMCA only (5c854333-6ea5-4faa-af31-67cb272fef80). Transportation + Trucking frozen — never read/write/report.
Prod: Neon tiny-field-89581227 / br-fancy-credit-akjnd07a; every read `SET LOCAL app.bypass_rls='lucia'`.
Run DB scripts from the Mac: `DATABASE_URL="$(head -1 ~/Downloads/lead-tmp/.prod)"` inline (never source/print it).
Render: API srv-d7rpem7avr4c73fhp4n0 (pre-deploy runs db:migrate) · Web srv-d7s46dbrjlhs7383i150 · Driver srv-d7s72ujrjlhs7385gbhg.

## READ FIRST (law)
- Project doc `claude/00-IH35-CURRENT-STATE-AND-LAW-READ-FIRST.md` + `docs/bus/lead/ALL-SEATS-FINAL-4-STATIC-REDS.md` (rules for every red guard).
- OWNER LAW tonight (verbatim): "If tested and pass you are to follow fast merge law" · "There should be no regressions" ·
  "each coder must finish … financial, mechanical, economic, money … total and complete wiring. no drifting, no deviating,
  never deferring. everything has been asked and answered, is in repo, docs files etc."
- Owner answers 10-25 9:37 PM (settled, do not re-ask): Transportation topics closed (escrow 3d527c58 = leave) · the system must
  do things automatically, not the Lead · there is NO hold · columns may be hidden/shown in the gear · FB-56707/FB-56711/56702 are
  flatbed (DONE, AUTH-472) · delete what is not necessary.

## THE MERGE COMMAND (everyone, every PR)
`git push --no-verify -u origin <branch>` then
`node scripts/fast-merge.mjs --branch <branch> --title "FINDING: <what>" --body-file <file>`
- Runs every guard that reads a changed file (verify-static classify), re-checks failures on a clean origin/main worktree, and
  REFUSES regressions (pre-existing reds only reported). Refuses undeclared file deletions (`--allow-delete <path>`).
- Body: ROOT CAUSE / FIX / GUARD / REMAINING / LIVE PROOF (command + exit) — warns only, never blocks.
- NEVER `git stash` (all worktrees share one stash list — it collided twice tonight).
- NEVER change working code or add comments/markers to satisfy a guard (fake green). Stale guard → update it to the correct
  contract WITH a selftest that plants the original defect. Never delete/weaken/baseline/raise ceilings.
- Squash merge must carry the body (fast-merge does this) — verify-claude-green-evidence-shape reads main's tip.

## P0 — DO FIRST (Lead)
1. **API deploys were failing since 04:06 UTC** (a symlink named `dist` was committed at repo root; tsc outDir=dist → ENOENT).
   Fixed by #27879 (removed + `/dist` in .gitignore). → Confirm the next API deploy is LIVE on Render. If not, read the build log.
2. After it is live: migration **202616290000** (bank-line check number from "CASHED CHECK HOLD … FOR CHECK #XXXXX001091") must be
   applied. Prove: USMCA `banking.bank_transactions` lines bb4c2e4f… / 91384d5e… carry check_number 1091 / 1092; USMCA count with
   check_number goes 65 → 91. Guard: `verify-bank-check-number-parsed --live`.
3. **GPS-dwell stop engine** (#27851, 1a91a7c84a) — measure after the engine's cron tick: USMCA completed loads with
   `mdata.loads.miles_driven_actual` NOT NULL (was 26 of 194). If it did not move, read `miles_driven_actual_reason` and the cron logs.

## PENDING — OWNER-REPORTED BANKING (11:03 PM) — CODEX
Owner, verbatim: "the check number does not appear in the check no column [FIXED #27877, pending deploy]. when i went to match the
transaction the suggested, there is no checks in suggestion in the filter. the filter is not dropdown combobox, i cannot type. … i
clicked on split the transaction to categorize, but the side modal appears under the pop up … the pop up matching should be a little
smaller, i think it is too wide. should have the full page option."
- B1 Match popup type filter must include **Checks** as a candidate kind (canonical check documents — accounting checks /
  banking.check_number_registry), and the suggested check must appear and be matchable. Never auto-match; suggestions only.
- B2 That filter must be the shared **typeable combobox / multi-select** (SelectCombobox / EntityMultiSelect), not a native select.
- B3 **Nested overlay order**: a drawer opened from a modal (Split/Categorize from the match popup) must render ON TOP. Fix in the
  shared Modal/ParityDrawer layer (portal/z order), app-wide, + guard asserting nested overlay order.
- B4 Match popup → shared Modal size **lg (960)** + a **full-page toggle** implemented once in the shared Modal as an opt-in prop.
- Guards for each (selftest plants). Merge each as it passes.

## PENDING — STATIC REDS (re-measure first: `node scripts/verify-static.mjs` ~25 min; last full run 525def8998 = 77 gated)
Since then merged: CC-3 lane all 20 (#27859–#27866) · new-since 13 (#27841–#27850) · many CC-1/CC-2/Cursor fills.
Read each seat's OUTBOX tail for its stop state (seats were told at 11:57 PM to push finished work and write state there).
- **CC-1 lane** (was 17): bills-settlement-column-linkage, cash-advance-requests-parity-surface-bar, cash-advances-f9930-no-silent-catch,
  cash-advances-home-staged-filters, cash-advances-table-parity-surface-bar, cash-flow-independent-of-proforma-timing,
  creator-advance-is-bill-payment-on-its-load, deadhead-pay-line-renders-on-settlement, escrow-ledger-row-has-load (REQUIRES_LIVE_DB added
  4e7ccb872a), escrow-pending-parity-surface-bar, item-income-account-required, list-empty-settled, load-miles-match-settlement-document,
  settled-load-stops-carry-the-document, truck-one-in-motion-plus-advance. (connectivity-nonmoney-create-remainder cleared by #27863.)
- **CC-2 lane** (7 red at 11:00 PM): bank-automatch-memo-threshold-calibrated (selftest: dropping the memo gate not caught),
  bank-econ-04-honesty-keep (selftest ENOENT — plant copies a moved file), banking-rules-follow-owner-rulings (needs static/--live split
  like #27859), factoring-package-popup-block-honesty (revert pattern stale), faro-kpi-strip (fixture drifted), fuel-posts-only-on-bank-match
  (selftest: dreamline discount posts twice not caught), relay-tick-completes (selftest ETIMEDOUT — find the hang).
- **Cursor lane** (19, partly done by a Lead fork): unfinished WIP pushed UNMERGED/UNTESTED to branch `lead/handoff-cursor19-wip`
  (MilesStrip.tsx, ReportsHomeBoard.tsx, verify-book-load-v3-layout.mjs). Re-run these on main and finish the red ones:
  collapsed-list-filters-apply, create-surface-is-drawer, customer-reclassification-history-scope, customers-list-master-detail,
  customers-open-balance-excludes-void, customers-vendors-list-segment-tabs, datepicker-label-clickthrough-reopen,
  insurance-dashboard-excludes-fixture-data, insurance-pageheader-usage, inventory-parts-create-qbo-chrome, k9-landing-filter-bar,
  list-defaults-and-kpi-shape, list-rows-use-datatable, lists-catalog-search-debounced, module-hub-navigation-connectivity,
  orphan-components, proportion-chrome-modal-drawer-density, reports-qbo-chrome-leaves, table-header-and-date-column.
- **CC-3 surface**: the last 3 hand-built overlays → shared Modal/ParityDrawer (components/dispatch/LoadDetailDrawer.tsx,
  pages/dispatch/components/BookLoadModalV4.tsx, book-load-v4/MilesInvertAckDialog.tsx); verify-popups-one-format baseline → 0;
  all mutations preserved. CC-3 is at 97% weekly limit — Codex takes it if CC-3 is out.
- **verify-join-entity-scoped**: only the escrow `listEscrowAccounts` site remains — owner closed the Transportation topic; leave it.

## PENDING — ENGINEERING (Codex)
- **Import cycle**: load-transition cycle still 11 files on the verify-no-circular-dependencies allowlist (CC-1 82e7b151e8 added it
  claiming "owner-gated" — invented). #27875 broke 2 cycles + cut this one 17→11. Finish by dependency inversion: leaf module
  `dispatch/load-transition-hooks.ts` (typed register/get); the transition engine calls delivery-latch / auto-invoice / invoice-send /
  billing-sync / settlement-void through it; registrations at module load from ONE bootstrap imported by the server entry AND test
  setup; an unregistered hook THROWS (never silently skip — would drop invoices). Same functions, order, client/transaction. Guard +
  selftest. Allowlist must return to the exact pre-82e7b151e8 set. Test parity vs origin/main on dispatch transitions, delivery latch,
  auto-invoice, invoice send, settlement void, book-load.
- **Row 264 / driven miles**: GPS-dwell engine is the automatic fix; if loads stay NULL, fix the engine (not a manual script).

## DONE TONIGHT (do not redo) — highlights
#27747 cancel-economics guard · #27748–#27753 63 of 65 unscoped joins scoped + postFinalLoadSettlementsGl entity-checked ·
#27751 KPI honest-null · #27756 bulk typed-confirm gate / fuel import kind / recon-unmatch guard · #27759/#27786/#27790 row 264
(14→26 of 194 real miles, AUTH-471 CLOSED) · #27775 duplicate settlement lines exact key, ceiling 0 (live 0) · #27778/#27808/#27828
fast-merge (never blocks on text; refuses regressions; refuses undeclared deletes) · #27805/#27806 sms/whatsapp queue prod drift
migration 202616280000 (live) + pm-schedule set-last-pm real columns · #27807 board numbers drill with live tie-outs ·
#27809–#27812 dispatch/fleet regressions · #27810–#27834 money regressions incl. two 42703 money reads fixed · #27818/#27824
FB flatbeds (AUTH-472 CLOSED) + gear-hidden columns (OWNER-REMOVE line) · #27820 UI/factoring · #27829 HOLD retired as required
check · #27841–#27850 new-since reds · #27851 GPS-dwell engine · #27859–#27866 CC-3 lane · #27875 cycles 2 of 3 · #27876/#27877
check-number parser · #27879 dist symlink P0.

## OWNER-ONLY ITEMS (do not act without him)
- AUTH-453 (Dreamline discounts → card-credit documents, 198 of 241 done) — paused by owner; ask him to renew.
- CC-2: confirm its stash `stash@{0} RESCUED-FROM-ACCIDENTAL-POP-cc2-banking-rules-1792903450` content is on its branch.

## SEAT ASSIGNMENT GOING FORWARD
- **Cursor (Lead)**: P0 1–3, re-measure static, merge watcher (any open PR → merge immediately if tested), finish its own 19 (or
  hand to Codex), relay the static list per seat, keep this journal: ~/Desktop/IH35-CLAUDE-JOURNAL.md.
- **Codex**: Banking B1–B4 · import-cycle hook registry · CC-3's 3 popups if CC-3 is out · any CC-1/CC-2 reds left unfinished.
- **CC-1 / CC-2 / CC-3**: finish their listed reds when they resume (CC-3 only the 3 popups).
