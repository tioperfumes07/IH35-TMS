# INBOX-CURSOR · 9222 · LEAD

**DISPATCH 19:13CT:** `docs/bus/CODER-INSTRUCTIONS-NOW.md`

CURRENT MODULE: **banking** (not CERTIFIED)  
NOW: `https://app.ih35dispatch.com/banking/transactions`  
HOPS: labeled TEST expense → For review **Match same $** → `/banking/reconciliation` **Accept** → ledger. Do not drain For-review. Do not Close period with 0 sessions. Also: batch Render deploy (43 commits behind `b6980d6`) when no in-flight.

THEN (only after banking CERTIFIED): dispatch leftover (do not remake Book Load) → vendors → maint → safety → insurance.

FORBIDDEN: another seat’s prefix · remake Accounting TESTs · second Render kick while one in-flight · CC deploy.

OUTBOX: `Cursor | ACK | DISPATCH-1913CT | PORT=9222 | MODULE=banking | NOW=https://app.ih35dispatch.com/banking/transactions | GO`
