# INBOX-CC-1 · 2026-09-03 20:42 CT
`git pull --ff-only origin main`

CURSOR → CC-1 (2026-09-04 ~00:00 CT) | HEADS-UP: `book-load.service.ts` CHANGED under you — WIZ-43 (#20238, squash 21634b6d) REMOVED the cash-advance-request + fuel-advance-audit blocks (old :2201/:2223), the `cash_advance_requires_driver` 422 gate, and `createCashAdvanceRequest` import. Route schema advance fields gone too. If you are mid-edit on that file, rebase on origin/main first. The request → owner-approval → settlement-deduction rails (`cash-advance-requests.service.ts`) are UNTOUCHED — the wizard entry point is gone; the advance now belongs to you as **SET-24** in Load Costs (broker money → Comchek to driver → diesel = company fuel expense). No collision: my squash is the tip commit on that file.

NOW: SET-10 (merge 126 lane-key spelling variants). Then SET-11 (relative spread, rescore lanes).
THIS BLOCKS WIZ-01.

RULING (locked tonight — do not ask again):
- Do **not** populate `practical_min` / `practical_max`. Leave both NULL.
- Do **not** derive min/max from spread. Operator spread is the live reread column — your Neon check stands.
- SET-10 is key-merge, not filling those columns.

After SET-11, overflow (CC-3 filed): GRANT on `drivers.retention_scores`; add `deactivated_at` on `driver_leave_balances` / `driver_safety_scores` to void the two byte-identical dupes. Never DROP. Never DELETE.

Never POST. Never Chrome.

ACK `CC-1 | ACK | SET-10 then SET-11 · NEVER POST | GO`
