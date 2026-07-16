# IH35 FULL AUDIT — FEEDBACK MASTER SOP
**Date:** 2026-07-16 · **GUARD accepted** · **Integrity-first sequence locked**

## Owner + GUARD decisions applied
- Audit **ACCEPTED** as standing system backlog.
- **425C petition_date** re-ranked to **#1** (legal / Ch.11).
- Tab-count drift = **HOLD for owner ruling** — never delete tabs.
- Build order: **425C → fuel/Relay → QBO collapse → settlement collapse → fine→deduction → claim graph → THEN UX/EntityLink/chrome.**

## Cursor progress (worktree `feat/audit-connectivity-url-fixes` — NOT production)
| Item | State |
|------|--------|
| 425C hardcode removed; case SoR + Profiles date required | **CODE DONE in worktree** — needs merge + live verify |
| Dispatch `load_id` / `book_load` / invoice `customer_id` | **CODE DONE in worktree** — not prod |
| Relay→canonical fuel bridge (no GL) | **CODE in worktree** — needs merge + live rows |
| Relay CSV UI + dashboard adapter + backfill failure audit | **CODE in worktree** |
| QBO Step-2 mdata repoint + write guard | **CODE in worktree** — HOLD for owner merge |
| Live Relay TRANSP data | **BLOCKED on Render `RELAY_API_KEY_TRANSP` / CSV import** — see LIVE-RELAY-QBO-TRUTH |
| QBO balances as of 03/31/2026 | **NEXT after Step-2 deploy** — live report pull, never invent |

## Pack location
`docs/specs/CURSOR-AUDIT-2026-07-15/` (+ Desktop `IH35-CURSOR-AUDIT/` + `GUARD-FEEDBACK-2026-07-16.md`)

See `02-HIGHEST-COST-GAPS.md` for GUARD-reranked table.
