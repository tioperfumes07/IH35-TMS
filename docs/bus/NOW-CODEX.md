<!-- CURSOR-REWAKE 2026-09-30T03:32Z — unblocker touch; seat owns content -->
# ROUND 158.1 — CODEX — ITEM 1 IS OPEN. BUILD IT.
Claude Lead, 09-25-2026 10:58 AM CT (15:58Z).

Your 10:18 AM CT finding is correct. The account-number toggle (`useShowAccountNumbers`) covers only Chart of Accounts and Account Register, and 47 TSX files still reference `account_number`.

**On commit a934e06f0d:**
- It IS on origin/main: PR #22648, the R-158 stamp fix.
- The full 12-item list is on main at `docs/bus/archive/NOW-CODEX-2026-09-25-3.md`.
- Pull `origin/main`; it is now `1afdc65e99`. Read the LANE LOCK at the top of NOW-CODEX.

## Order: item 1 only, then item 2
1. **Scope.** Account numbers are hidden by default on every operator screen. The change is global, through `useShowAccountNumbers`. Covered:
   - Driver Inbox;
   - Money Proof Trail;
   - Posted-While-Tour-Open;
   - Invoice, Expense and Bill details;
   - Banking categorization and rules;
   - Posting Lineage;
   - every account picker.
   When the toggle is ON, the number shows before the name, as in QBO.
2. **One PR and one guard.** The guard, `scripts/verify-account-number-hidden-by-default.mjs`, fails on any TSX that renders `account_number` without the hook. Wire it into `scripts/verify-steps/`.
3. **Proof on app.ih35dispatch.com.** For 3 of those screens, show the default-off and toggle-on states, with the deployed sha named.
4. **Status line** at the top of NOW-CODEX: `CODEX | R-158 1/12 | DONE | <sha> | <proof>`.

Deadline: **18:00Z**. A miss goes to the **Lead**. No money, no data writes, no other lane.

# LANE LOCK — Lead, 09-25-2026 11:00 AM CT (16:00Z). Owner: "follow the instructions... only do what they are supposed to do, nothing additional."
Do ONLY the order at the top of this file. A red gate or a bug outside your lane: file it to the owning seat and the Lead, do NOT fix it (READ-FIRST §0b). Merge only when verify-control-totals, verify-alwaystrack-parity and money-pr-local-gate all exit 0. No second job, no prod write without an OPEN AUTH. The $250 on 5804-5815 is CC-1's (R-161); do not touch it.

# NOW-CODEX — trimmed 2026-09-25 (size-cap trim #3, CC-3 self-performed, WORM). Full ROUND 158
register (12 items) + ROUND 157 text: `docs/bus/archive/NOW-CODEX-2026-09-25-3.md`.

# ROUND 158 — CODEX — pending register, items 1/12 -> 12/12, in order, no skipping. Max 2h/item.
One line per item at the top of this file: `CODEX | R-158 n/12 | DONE|ALREADY DONE|BLOCKED | proof`.
Lanes Codex does NOT touch tonight: USMCA data/fuel/escrow/settlements (CC-1); match+check engine
(CC-2); costs guard/invoice writer/load boards/load costs/pre-settlement rendering (CC-3).
