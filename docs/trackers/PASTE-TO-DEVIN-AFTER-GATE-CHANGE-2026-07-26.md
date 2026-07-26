# PASTE-TO-DEVIN — after label-gate removal

1. Merge **THIS PR first** (chore/remove-jorge-approved-label-gate) so open PRs pick up the new gate on rebase.
2. Then continue: #3603 → #3588 → #3589 → #3591 → #3595 → #3596 → #3593 → #3601
3. **No JORGE-APPROVED needed.** Rebase each onto main after step 1 so hold-merge-gate goes green without label.
4. Still: one held-registry PR at a time; no Neon re-apply for already-applied migrations.

ACK: DEVIN ACK | merge gate-change PR first | then seq without label
