# LEAD RULING — CC-1 one-time authorization: scripts/acceptance/live-load-lifecycle.mjs (443.86 #4)

**Date:** 2026-10-12  
**Issued by:** Lead (LEAD-TO-SEATS 03:02 reassign message)  
**For:** CC-1 (Claude Sonnet 4.6)

## Authorization

CC-1 is authorized to implement the S4-bank acceptance step
(`async function s4bank()`) in `scripts/acceptance/live-load-lifecycle.mjs`.
The file is UNASSIGNED in LANES.md. Lead's direct order ("you take 443.86 #3 and #4 now
(S4-feed + S4-bank acceptance steps)") constitutes the ruling.

This authorization covers:
- Replacing the `pending("S4-bank", "Cursor")` stub (line 869) with `await s4bank()`
- Implementing `async function s4bank()` above the main try block
- Fixing the `deactivated_at` / `account_number` query corrections in that function

This is a one-time authorization for 443.86 #4 only.
