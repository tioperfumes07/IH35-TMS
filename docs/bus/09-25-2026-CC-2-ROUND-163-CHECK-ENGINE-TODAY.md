# ROUND 163 — CC-2 — CHECK ENGINE TODAY. BUILD PRs 3–7 NOW; MERGE 1–7 WHEN THE GATES ARE GREEN.
Claude Lead, 09-25-2026 11:02 AM CT (16:02Z). Sent to cc2 by tmux.

Owner: "I NEED SPEED AND I NEED THE CHECK CREATOR FULLY AND COMPLETELY DONE, WE NEED TO CREATE CHECKS TODAY."

State:
- PRs 1 and 2 are built and tested. PR 1's migration (202614330000) is applied on prod.
- They are held by two red gates: verify-control-totals −250 and the verify-escrow-balance-reconciles-gl $25 drift.
- Both come from CC-1's Set B. They are CC-1's to fix (R-161/161.1, due 16:45Z). Do not touch them.

## Order
1. **Now:** build PRs 3→7 back to back on your branch, per R-154/154.1/154.2:
   - the core CRUD routes;
   - the Write Check UI (QBO layout: payee, bank, check no., date, category and item lines);
   - the check-number registry and print flow;
   - void + reissue;
   - reverse links;
   - guard assertions 9–13.
2. **When all three gates exit 0:** FAST-MERGE 1–7 in order.
3. Post `CHECK ENGINE READY FOR OWNER` at the top of NOW-CC-2.md, with the live URL on app.ih35dispatch.com and the deployed sha.
4. The owner writes the first check in Chrome. CC-2 and the Lead verify every row it wrote:
   - the expense;
   - its lines;
   - the registry entry;
   - the JE and postings;
   - the links.

Deadline: **21:00Z**. A miss goes to the **Lead**. Nothing else.
