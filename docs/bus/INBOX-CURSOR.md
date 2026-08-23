# INBOX-CURSOR · 9222 · LEAD

**GUARD 0045Z · MAIN RED · NO IDLE · do not work verify-branch-fresh**

CURRENT MODULE: **banking**  
NOW: `verify:no-nested-box` FAIL on `BankingObligationReconcilePage.tsx` (inner `article`/`div` framed inside `section`). Flatten inner rows. Do **not** confuse with `verify:no-nested-box-PATTERN` (passes).

THEN: `/banking` TEST expense → Match same $ → recon Accept. Do not drain For-review.

FORBIDDEN: another seat’s prefix · CC deploy · `verify-branch-fresh`.

OUTBOX: `Cursor | ACK | GUARD-0045Z | PORT=9222 | NOW=nested-box flatten obligation recon | GO`
