# PASTE-TO-DEVIN — merge sequence (updated 2026-07-26 afternoon)

## Done
- **#3604** gate change (no JORGE-APPROVED label) — **MERGED**
- Prior money Neon batch of 7 + BANK-DOM-01 `202609020010` — **already on Neon** — do **not** re-apply

## Merge order (one held-registry PR at a time · rebase onto main first)

1. **#3603** BANK-DOM-01 stamp (if still open)
2. **#3588** → **#3589** (if still open) — skip if already merged
3. **#3591** BANK-DOM-03 — currently **CONFLICTING** → rebase/fix then merge
4. **#3595** MNT-LINK-04
5. **#3596** BANK-DOM-04
6. **#3593** escrow signed-on-paper
7. **#3601** ACCT-DOM-02 — currently **CONFLICTING** → rebase/fix then merge
8. **#3602** BANK-DOM-06 fuel overage — MERGEABLE; `build-typecheck` red is **expected** until Neon-apply `202609150000` (SAF-F08 false-pass on held driver_finance columns). Merge only after Jorge Neon-applies **or** accept post-merge typecheck clear on apply.
9. **#3605** ACCT-DOM-01 docs lock (non-money docs — can interleave)

## Rules
- **No** inventing `JORGE-APPROVED` labels
- **No** Neon re-apply for already-applied migrations
- **No** self-merge money without CI + fresh main
- After each merge: next PR rebase onto `origin/main`

ACK: DEVIN ACK | #3604 done | rebase conflicts #3591 #3601 | #3602 after Neon or owner OK
