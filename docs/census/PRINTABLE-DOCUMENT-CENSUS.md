# PRINTABLE DOCUMENT CENSUS — Round 435-DEV (measured 2026-10-06)

Owner: "every document we created should already be PDF ready to print."

**32 documents · 5 NO-PDF · shrink-only guard: `scripts/verify-printable-document-census.mjs` (step 18345)**

| Document | Created | PDF generator | Reachable from UI | State |
|---|---|---|---|---|
| Load confirmation / dispatch sheet | dispatch (Book Load / Load Detail) | apps/backend/src/dispatch/dispatch-sheet.routes.ts (.html via wrapPdfDocument) | LoadDetailDrawer.tsx, BookLoadModalV4.tsx | HAS-DESIGNED-PDF |
| Bill of lading | dispatch POD flow | apps/backend/src/dispatch/bol-generator.service.ts (bol.hbs) → GET bol.pdf (pod.routes.ts:414) | LoadBolPanel.tsx | HAS-DESIGNED-PDF |
| Rate confirmation | uploaded external doc (ratecon-extract OCR); app does not generate one | none | none | NO-PDF |
| Driver load instructions | dispatch load distribution | apps/backend/src/dispatch/pdf-generator.service.ts (driver-instructions.hbs) | load-distribution.service.ts (auto on send) | HAS-DESIGNED-PDF |
| Customer invoice | accounting invoices | apps/backend/src/accounting/invoice-render.routes.ts (.html via wrapPdfDocument) | InvoiceDetailPage.tsx | HAS-DESIGNED-PDF |
| Driver settlement | driver-finance settlements | apps/backend/src/driver-finance/settlement-render.routes.ts + settlement-pdf-renderer.service.ts | SettlementDetailPage.tsx | HAS-DESIGNED-PDF |
| Company settlement | accounting company settlements | apps/backend/src/accounting/company-settlement-render.routes.ts (company-settlement.template.ts) | CompanySettlementsPage.tsx | HAS-DESIGNED-PDF |
| Driver bill | driver-finance driver-bills.routes.ts | none — 4 routes, no pdf/html/print | none | NO-PDF |
| Vendor bill | accounting bills | apps/backend/src/accounting/bill-render.routes.ts (.html via wrapPdfDocument) | BillDetailPage.tsx | HAS-DESIGNED-PDF |
| Bill payment / remittance | accounting bill payments | apps/backend/src/accounting/bill-payment-render.routes.ts | BillPaymentDetailPage.tsx | HAS-DESIGNED-PDF |
| Check | accounting checks | check-print-batch.service.ts + checks.routes.ts (render/check.template.ts) | CheckPrintPage.tsx | HAS-DESIGNED-PDF |
| Expense / receipt | accounting expenses | none (client printLetterHtml dump) | ExpenseDetailPage.tsx | HAS-PDF-BUT-UNDESIGNED |
| Cash advance receipt | cash advances | none (client printLetterHtml dump) | AdvanceDetailDrawer.tsx | HAS-PDF-BUT-UNDESIGNED |
| Work order | maintenance work orders | apps/backend/src/work-orders/wo-pdf-renderer.service.ts → GET /pdf | WorkOrderCopyLinks.tsx / maintenance api | HAS-DESIGNED-PDF |
| Severe repair estimate | maintenance severe-repair | apps/backend/src/maintenance/severe-repair-pdf-export.ts (raw HTML, no letter shell) | apps/frontend/src/api/maintenance.ts | HAS-PDF-BUT-UNDESIGNED |
| Contract instance | legal contracts | apps/backend/src/legal/pdf-renderer.service.ts → GET draft-pdf | apps/frontend/src/api/legal-contracts.ts | HAS-DESIGNED-PDF |
| Insurance certificate (COI) | insurance policies | apps/backend/src/insurance/coi-pdf-renderer.service.ts — DEAD CODE (no route caller, only test mocks) | none | NO-PDF |
| IFTA return | ifta quarterly preparer | apps/backend/src/ifta/ifta-return-pdf-generator.ts — DEAD CODE (no route caller; only CSV wired) | IFTAStepCSVExport.tsx (CSV only) | NO-PDF |
| Form 2290 HVUT | compliance filings | apps/backend/src/compliance/form-2290-generator.ts → route returns pdf_base64 | Form2290Filings.tsx | HAS-DESIGNED-PDF |
| Form 425-C filing + exhibits | compliance | apps/backend/src/compliance/form-425c-pdf.ts → POST generate-filing-pdf | ExhibitsViewer.tsx / form425c api | HAS-DESIGNED-PDF |
| Property tax rendition | compliance property tax | apps/backend/src/compliance/property-tax/property-tax-pdf-renderer.service.ts | PropertyTaxRenditionPage.tsx | HAS-DESIGNED-PDF |
| eManifest (border crossing) | border-crossing wizard | apps/backend/src/border-crossing/emanifest-pdf-renderer.service.ts → GET emanifest.pdf | WizardStep6.tsx | HAS-DESIGNED-PDF |
| ELD audit trail (DOT inspection) | safety ELD | apps/backend/src/safety/eld-audit-trail/eld-audit-pdf-renderer.service.ts → GET export.pdf | EldAuditTrailViewer.tsx | HAS-DESIGNED-PDF |
| Driver qualification profile | mdata drivers | apps/backend/src/mdata/driver-profile-pdf-renderer.service.ts → GET export.pdf | driver-profile/ActionBar.tsx | HAS-DESIGNED-PDF |
| Unit profile | mdata units | apps/backend/src/mdata/vehicle-profile-pdf-renderer.service.ts → GET export.pdf | vehicle-profile/ActionBar.tsx | HAS-DESIGNED-PDF |
| Trailer profile | mdata equipment | apps/backend/src/mdata/trailer-profile-pdf-renderer.service.ts → GET export.pdf | trailer-profile/ActionBar.tsx | HAS-DESIGNED-PDF |
| 1099-NEC | tax-documents | apps/backend/src/tax-documents/tax-document-pdf-renderer.ts → POST render-pdf | vendors components | HAS-DESIGNED-PDF |
| Counterparty statement | accounting counterparty statements | apps/backend/src/accounting/counterparty-statements.routes.ts (wrapPdfDocument) | CounterpartyStatementPage.tsx | HAS-DESIGNED-PDF |
| Statement exports (TB / P&L / BS / CF / AR aging / AP aging) | accounting statement-export + scheduled-reports runner | apps/backend/src/accounting/statement-export.routes.ts + statement-export-pdf.service.ts (designed PDF endpoints EXIST but frontend never calls them — report pages print via printLetterHtml dump instead) | FinancialStatementsPage.tsx, TrialBalancePage.tsx, ProfitLossPage.tsx, BalanceSheetPage.tsx, ARAgingPage.tsx, APAgingPage.tsx (all printLetterHtml) | HAS-PDF-BUT-UNDESIGNED |
| Reports printing via client dump (customer profitability, fuel recon, maintenance cost, profit per truck, settlement summary, management package, cash-flow overview, register, reconciliation, misc) | reports/ | printLetterHtml client letter — no letterhead/totals block | 14 report/finance pages | HAS-PDF-BUT-UNDESIGNED |
| Reports with NO print path (16 report pages) | reports/ | none | BookingGap, Cancellations, CashFlowReport, Deadhead, DispatchMargin, DriverQualification, DuplicateMasters, GeofenceDwell, GeofenceRecon, InvoiceSearch, LaneProfitability, LateArrival, Loads, PerTruckCpm, PostedWhileTourOpen, ReeferFuelCredit | NO-PDF |
| POD (proof of delivery) | uploaded doc (pod.routes.ts serves uploaded pdf_r2_key) | external — stored, not generated | pod review / load drawer | HAS-DESIGNED-PDF |

**NO-PDF:** rate confirmation (app generates none), driver bill, insurance COI (renderer is dead code), IFTA return (generator dead — CSV only), 16 report pages with no print path.

**HAS-PDF-BUT-UNDESIGNED:** expense/receipt, cash-advance receipt, severe-repair estimate, statement exports (designed backend /export/pdf endpoints exist but UI prints via the printLetterHtml client dump), all 14 printLetterHtml report/finance pages.

Build order is the owner's pick — this PR is measurement + the ratchet only.
