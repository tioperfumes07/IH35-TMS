# LEAD SEAT LISTS — 10-26-2026 ~1:35 AM CT (Cursor Lead)
Tip at handoff measure: `cbba508672` (+ Cursor-19 PR when merged). USMCA only. Never stash. Never fake-green.
Merge: `node scripts/fast-merge.mjs --branch <b> --title "FINDING: …" --body-file <f>` after push `--no-verify`.

## P0 (Lead — measured LIVE)
1. **Render API LIVE** — `srv-d7rpem7avr4c73fhp4n0` deploy `dep-dbfeul0473hc73a03cug` status=live on tip `cbba508672` (#27881), finished 06:15:58Z (after #27879 dist symlink fix).
2. **Migration 202616290000 applied** — `_system._schema_migrations` @ 2026-10-26 05:03:39Z; USMCA `check_number` NOT NULL = **91** (was 65); lines `bb4c2e4f…`→1091, `91384d5e…`→1092; `verify-bank-check-number-parsed --live` PASS (0 missing).
3. **miles_driven_actual** — USMCA active loads **45 / 198** (was 26/194). Cron recomputed 169 loads in last 6h; max_computed 03:25Z; source=odometer for all 45. Remaining NULL mostly manual stop times / far dwell refused — engine fix if needed, not a script.

## CODEX (exact)
- **B1** Match popup type filter includes **Checks** (canonical check docs); suggested check matchable; never auto-match. Guard+selftest.
- **B2** That filter = shared typeable combobox/multi-select (SelectCombobox / EntityMultiSelect). Guard.
- **B3** Nested overlay: drawer from modal renders ON TOP (shared Modal/ParityDrawer portal/z). Guard.
- **B4** Match popup = shared Modal size **lg (960)** + full-page toggle opt-in prop. Guard.
- **C2** Load-transition import cycle: leaf `dispatch/load-transition-hooks.ts` + bootstrap; unregistered THROWS; allowlist → pre-82e7b151e8 set; test parity.
- **C3 DONE on tip** — #27881 already took popups baseline 3→0 (LoadDetailDrawer · BookLoadModalV4 · MilesInvertAckDialog). Do not redo.
- Any CC-1/CC-2 reds left unfinished after verify-static finishes (Lead will append exact FAIL names).

## CC-1 (exact — finish when resumed)
bills-settlement-column-linkage · cash-advance-requests-parity-surface-bar · cash-advances-f9930-no-silent-catch · cash-advances-home-staged-filters · cash-advances-table-parity-surface-bar · cash-flow-independent-of-proforma-timing · creator-advance-is-bill-payment-on-its-load · deadhead-pay-line-renders-on-settlement · escrow-ledger-row-has-load · escrow-pending-parity-surface-bar · item-income-account-required · list-empty-settled · load-miles-match-settlement-document · settled-load-stops-carry-the-document · truck-one-in-motion-plus-advance.

## CC-2 (exact — finish when resumed)
bank-automatch-memo-threshold-calibrated · bank-econ-04-honesty-keep · banking-rules-follow-owner-rulings · factoring-package-popup-block-honesty · faro-kpi-strip · fuel-posts-only-on-bank-match · relay-tick-completes.
Also: confirm stash `stash@{0} RESCUED-FROM-ACCIDENTAL-POP-cc2-banking-rules-1792903450` content is on its branch (owner-only confirm — Lead does not pop stash).

## CC-3
Only if usage returns: nothing — C3 popups DONE (#27881). Idle / help Codex B3 if needed.

## CURSOR (Lead)
- Cursor-19: **DONE** — #27883 squash `312e15c00a` (19/19 PASS; hand_rolled 44→40).
- Merge watcher: any open tested PR → fast-merge immediately (none open at 01:37 AM CT).
- Re-measure: `node scripts/verify-static.mjs` running in tmux `verify-static-lead`; will re-hand FAIL lists when summary lands.
- Journal: `~/Desktop/IH35-CLAUDE-JOURNAL.md`.

## OWNER-ONLY (do not act)
AUTH-453 Dreamline discounts paused — ask owner to renew.
