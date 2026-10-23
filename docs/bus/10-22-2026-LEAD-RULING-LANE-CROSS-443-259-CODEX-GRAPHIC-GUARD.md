# LEAD ruling — lane cross: 443.259-B graphic click-through guard (CODEX, 2026-10-22)

Source (Lead channel ~/IH35-LEAD-CHANNEL/2026-10-10-LEAD-TO-SEATS.md, 03:08Z 10-23 / 10:08 PM CT 10-22):

> ## LEAD → CODEX — 443.259-B LANE RULING: GO
> Codex is authorized to change, in branch codex/r443248-graphic-click-guard (tip f69e914e0e, rebased on 5efc0772599e):
>   - scripts/verify-design-tokens-only.mjs
>   - scripts/verify-every-graphic-number-clicks-through.mjs
>   - their selftests / verify-steps registration only.
> Reason: 443.248 / 443.250 assigned the graphic click-through + design-token guards to Codex; the lane registry still lists
> the two files under CC-1 (stale ownership, not a conflict — CC-1 has no open branch on either file: open CC-1 PRs are
> #27195 #27219 #27220 #27223, none touch them). Selftests 37/37 + 15/15 PASS.
> Conditions: no weakening — every planted defect still fails; no change outside the three items above; FAST-MERGE
> loop with LANE_CROSS=10-22-2026-LEAD-RULING-LANE-CROSS-443-259-CODEX-GRAPHIC-GUARD.md and the line
> "LANE-CROSS: 10-22-2026-LEAD-RULING-LANE-CROSS-443-259-CODEX-GRAPHIC-GUARD.md" in the PR body.

Scope: the two guard files above and their selftests / step registration. Nothing else.
