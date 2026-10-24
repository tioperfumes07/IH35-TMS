# INBOX-CURSOR

Archived 2026-10-17 — content moved to [archive/INBOX-CURSOR-archive-2026-10-17.md](archive/INBOX-CURSOR-archive-2026-10-17.md). Live seat orders: the Lead channel (LEAD-TO-SEATS).

## CURRENT (2026-10-24 01:55 PM CT) — LEAD: 443.325 IS ITEM 1, DO IT BEFORE 443.293-C SLICE 2

0. **443.325 — Engine register UI items ENG-30..33** (deadline 2026-10-25T03:00Z; full box below, also ~/Downloads/10-24-2026-Cursor-443.325-Engine-Register-UI-Items.md). Register rows ENG-30..33 in docs/bus/lead/LEAD-PENDING-REGISTER.md. One PR + one guard per item, guard red on the pre-fix tree then green, no baseline raised.

    # Cursor · ROUND 443.325 — Engine register UI items (measured 10-24 12:46 PM CT on main e273a179b7)
    Issued 10-24-2026 01:05 PM CT (18:05Z) by Claude Lead. DEADLINE 2026-10-25T03:00Z. Missed item → Lead takes the surface.
    Owner pastes this to Cursor. RULES: one PR + one named guard per item, guard RED on the pre-fix tree then GREEN, wired. No baseline raised. Register id (ENG-nn) in the PR title.
    
    ## ENG-30 15 raw <select> left in non-test .tsx (every selector multi-select law)
    Do: convert each to EntityMultiSelect / MultiSelectDropdown, or list the ones that must stay single with the reason. Guard: verify-every-selector-multi-select (shrink-only, starts at 15).
    
    ## ENG-31 Breadcrumbs on 10 of 999 page files
    Do: the page shell renders the breadcrumb from the route so every page gets one (one change, not 989). Guard: verify-page-has-breadcrumb.
    
    ## ENG-32 89 money cells that do not open their transaction (10-05 count)
    Do: re-run scripts/verify-money-cells-click-through.mjs, paste the count, shrink it; no money cell without its drill. Guard: the same (shrink-only).
    
    ## ENG-33 Stale comment
    BankingTransactionsDesignView.tsx:4017 still calls MatchDrawer "the orphaned MatchDrawer" — it is the one matcher now (443.163). Fix the comment.
    
    REPLY: per item — PR #, guard red → green (pasted).

1. **443.293-C** — Accounting tabs V3 board grammar (Bills reference). Slice 1 recurring bills MERGED #27495 `9ceba87718`. Next: slice 2 — `/accounting/bills/multiple` + `/accounting/bills/vendor` leaves to All-bills V3 grammar; then remaining Accounting tabs.
2. **ROW 219** — CODED #27481 `9b651bfdb4` (Close settlement on Dispatch).
3. **443.293-A / ROW 218** — DONE #27465. **REG-102** — DONE #27477.
4. Drain remaining Cursor register rows (boards 37–56, dates, labels, layout, 114 confirm). CODE-COMPLETE deadline Sat 10-24 10:00 AM CT / 15:00Z.


> **Standing law (on-demand):** [HONEST-BUILT-LAUNCH-LAW-2026-08-14](../lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md) — built = live-proven, never claimed.
