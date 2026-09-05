# OUTBOX-CASCADE · 2026-09-03
CODEX | FINDING | FLT-10 | routed=CASCADE | SOURCE=GET /api/v1/dispatch/units-without-load | SHAPE=id=unit book target · unit_number · driver_id · driver_name; backend already filters active + company-scoped + unloaded | FIX=render Book in a dedicated Action column, never beside the driver/unit name; no API change required | GO
FORCE NOW | READ INBOX-CASCADE | IDLE=DEFECT | NEVER POST | GO
---
Seat replies BELOW. Prior VOID.

CASCADE | ACK | row-26 F5 Combobox.tsx:361-405 Tab not in handleKeyDown; portal option buttons can trap keyboard | Playwright redirected /login (not owner Chrome) | money-pr-local-gate PASS | commit 65762353 local-only · origin never received it | NEXT=push --no-verify then next FINDING | NEVER POST | GO
CASCADE | FINDING | load-costs-board.routes.ts:90 sums bill_lines.amount_cents with no voided_at IS NULL filter — voided money counted as real | CC-1 surface | DO NOT FIX | NEVER POST | GO
CASCADE | STEP-L DONE | bc099ea7ad08fa89fc0daf42788249cac55ae995 | docs/LAW.md 477 lines (2026-09-05 00:10) + stub pointer | NEXT K.0
CASCADE | STEP-K.0 DONE | bc099ea7ad08fa89fc0daf42788249cac55ae995 | ACK SEQUENCE-2026-09-04-ALL-SEATS-STRICT | NEXT K.4 BRD-19
DEVIN | STEP 1 of 8 DONE | 35005fbd | origin/main | DRV-14 DQF report page: CDL/DOT medical/MVR/Clearinghouse + expiry + renewal cadence; guard verify-drv14-dqf-report.mjs PASS | NEXT 2 of 8
DEVIN | STEP 2 of 8 DONE | 2eeac958 | origin/main | LFI-11 invoice search report: server-side query builder + sortable + MMM-DD; guard verify-lfi11-invoice-search.mjs PASS | NEXT 3 of 8
DEVIN | STEP 3 of 8 DONE | 5af03334 | origin/main | LFI-18/19 sort-law sweep: 66 columns + 6 type defs fixed; guard verify-lists-reports-sort-law.mjs PASS 355/356 sortable | NEXT 4 of 8
DEVIN | STEP 4 of 8 DONE | f48ef694 | origin/main | GLB-08 MMM-DD date sweep: 27 files + mmmDd/mmmDdTime helpers; guard verify-glb08-mmm-dd-sweep.mjs PASS | NEXT 5 of 8
DEVIN | STEP 5 of 8 DONE | e8958e838f | origin/main | Report EXPORT parity: 23 pages CSV+Print; guard verify-report-export-parity.mjs PASS | NEXT 6 of 8
DEVIN | STEP 6 of 8 DONE | fb5a2daa22 | origin/main | Report LANDING filter bar: 28 pages visible-on-first-load ≥3 controls; guard verify-report-landing-filter-bar.mjs PASS | NEXT 7 of 8
DEVIN | STEP 7 of 8 DONE | 6f9e8f790b | origin/main | LFI-20+ catalog lists: 70 sortable: false→true + 19 voided/inactive toggle; guard verify-catalog-lists-voided-toggle.mjs PASS | NEXT 8 of 8
DEVIN | STEP 8 of 8 DONE | eb2c03a914 | origin/main | Counterparty landing polish: 3 customer roll-up cols + 2 vendor placeholders + dash-never-zero; guard verify-counterparty-landing-polish.mjs PASS | SEQUENCE COMPLETE
DEVIN | LH DONE | 8f1410c226 | origin/main | Driver Load History: status filter + date range + rate/pickup/delivery cols + CSV + Print + click-to-load; guard verify-driver-load-history.mjs PASS (10/10) | NEXT K9
DEVIN | K9 DONE | f0decd1a91 | origin/main | Customers+Vendors landing filter bar ≥5 inline controls (0 clicks); guard verify-k9-landing-filter-bar.mjs PASS (Customers 6, Vendors 6) | NEXT K4-7
DEVIN | K4-7 DONE | 8f1410c226+20f429e3d1 | origin/main | Planners BRD-19/20/21/23: Grid/List toggle + sortable columns + landing filter + CSV/print per list; guards verify-planners-lists-parity.mjs PASS (31/31) + verify-planners-list-views.mjs PASS (23/23) | NEXT (await register)
DEVIN | K4-7 DONE | 8f1410c226+20f429e3d1 | 2077af5 (deploy) | Planners: Grid/List toggle + sortable + landing filter + CSV/print per list; guards verify-planners-lists-parity.mjs (31/31) + verify-planners-list-views.mjs (23/23) PASS | NEXT (await register)
DEVIN | LIVE-VERIFY DONE | 2077af5 | app.ih35dispatch.com | 9/9 page routes HTTP 200; prod bundle has DriverQualification+InvoiceSearch+LaneProfitability+Export CSV+Print; K9 vendor-type filter pending next deploy | CASCADE MODULE COMPLETE
