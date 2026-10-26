# CODEX — INSTRUCTIONS — 10-26-2026 12:05 AM CT (from outgoing Claude Lead; Cursor is the new Lead)
Read first: `~/Downloads/10-26-2026-Cursor-NEW-LEAD-HANDOFF-AND-PENDING.md` (law, merge command, prod access).
USMCA only. Never `git stash`. Merge every passing fix immediately with `node scripts/fast-merge.mjs` (refuses regressions).
Full and complete wiring — backend, frontend, data, guard + selftest, tests. No shells, no deferring, never change working code to
satisfy a guard. Every answer is in the repo/docs; do not stop to ask.

## C1 — Banking match (owner report 11:03 PM) — one PR per item
- B1 Match popup type filter includes **Checks** (canonical check documents) as a candidate kind; the suggested check appears and is
  matchable. Never auto-match. Guard + selftest.
- B2 That filter = shared typeable combobox/multi-select (SelectCombobox / EntityMultiSelect). Guard.
- B3 Drawer opened from a modal renders ON TOP (Split/Categorize from the match popup). Fix in the shared Modal/ParityDrawer layer
  (portal/z order), app-wide. Guard asserting nested overlay order.
- B4 Match popup = shared Modal size lg (960) + full-page toggle as an opt-in prop of the shared Modal. Guard.
Start by reading pages/banking/** (BankingTransactionsDesignView, match panel/modal), components/Modal.tsx, ParityDrawer,
recon-worklist / bank-line state machine. Extend, do not duplicate.

## C2 — Load-transition import cycle (11 files still allowlisted)
Dependency inversion via leaf `dispatch/load-transition-hooks.ts`; one bootstrap registration file imported by server entry AND test
setup; unregistered hook THROWS; identical functions/order/transaction; guard + selftest; allowlist back to the exact
pre-82e7b151e8 set; test parity vs origin/main (dispatch transitions, delivery latch, auto-invoice, invoice send, settlement void,
book-load). See handoff for detail.

## C3 — If CC-3 is out of usage: the last 3 hand-built overlays → shared Modal/ParityDrawer
components/dispatch/LoadDetailDrawer.tsx · pages/dispatch/components/BookLoadModalV4.tsx · book-load-v4/MilesInvertAckDialog.tsx.
All mutations preserved; verify-popups-one-format baseline → 0.

## C4 — Any CC-1 / CC-2 static reds the Lead hands you (lists in the handoff)
DONE line per item: `CODEX | <item> DONE | PR # | merge sha | guard PASS line | tests`.
