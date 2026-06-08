# IH35-TMS — Known Limitations

**Block:** 29 of 29 — TIER4-KNOWN-LIMITATIONS  
**Last updated:** 2026-06-08  
**Owner:** Jorge Munoz  
**Audience:** Internal (staff + dispatchers) — see [Customer-Facing Version](#customer-facing-version) below

> This is a living document. When a new limitation is discovered, add it here. When a limitation is resolved, move it to the [Recently Resolved](#recently-resolved) section.

---

## How to Use This Document

- **Dispatchers / staff:** Read this before promising a feature to a customer or shipper.
- **Onboarding:** New dispatchers should read this document in their first week.
- **Developers:** Check this before starting a new feature — it may already be tracked here.

---

## Scale Limits

1. **Max trucks tested:** Load testing validated to ~50 active trucks. Performance at 300 trucks (target scale) is projected but not load-tested end-to-end. Block 26 partitioning is the remediation path.
2. **Max concurrent users:** Tested for ~20 simultaneous users. Response times under 200ms at that level. Not stress-tested beyond 50 concurrent users.
3. **Max loads per page:** List views paginate at 50 results. Fetching more than 200 loads in a single API call is not supported (returns 400).
4. **Max file upload size:** Document uploads capped at 10MB per file. Larger PDFs (e.g., long permits) must be compressed first.
5. **Samsara event throughput:** Currently processes up to ~1,000 telematics events per minute. At 300 trucks with high-frequency polling, this may saturate. Partition work (Block 26) addresses this for storage.
6. **QBO sync latency:** QBO sync queue processes in batches with up to 5-minute delay. Real-time QBO reflection is not guaranteed.
7. **Reporting query timeout:** Complex cross-module reports (e.g., P&L by truck) time out at 30 seconds. Very large date ranges (> 1 year) may be slow.

---

## Feature Gaps vs QBO

8. **No CFDI / SAT electronic invoicing:** Mexican customers cannot receive CFDI-compliant electronic invoices. Must be issued manually through a CFDI-authorized PAC. (Future block.)
9. **No payroll tax filing:** IH35-TMS calculates driver pay and posts JEs, but does not file 940/941 or issue W-2s automatically. Must be done in QBO or ADP.
10. **No full accounts payable aging:** AP aging report shows balances but not the full aging buckets (current / 30 / 60 / 90+) available in QBO. Workaround: run in QBO directly.
11. **No budget vs actual module:** QBO supports budget tracking; IH35-TMS does not yet have a budget entry module.
12. **No multi-entity consolidated reporting:** Each operating company's financials are isolated. Cross-company consolidation reports are not available (must export from QBO).
13. **No 1099-NEC auto-filing with IRS:** IH35-TMS generates 1099 data but does not e-file with the IRS. Must be submitted through QBO or a 1099 filing service.
14. **No recurring invoice automation:** Invoices must be created manually per load. No subscription/recurring billing for fixed-fee customers.
15. **No bank feed reconciliation in QBO style:** IH35 has bank import but auto-matching to invoices/bills is basic. Complex bank statement reconciliation may require manual matching.

---

## Integration Gaps

16. **Samsara HOS real-time push notifications:** HOS violations are available in the Samsara dashboard but not yet surfaced as in-app alerts in IH35. Dispatcher must check Samsara portal separately.
17. **Samsara DVIR defect photos:** DVIR defect descriptions sync but attached photos from the Samsara driver app do not sync to IH35.
18. **QBO class tracking in all contexts:** QBO class tags on transactions are supported for loads but not consistently applied to all AP bills.
19. **ComData/Relay fuel matching to loads:** Fuel transactions import but are not automatically matched to specific loads. Matching is manual.
20. **Plaid does not support all banks:** Banks not in the Plaid network (~3% of US banks) must use CSV manual import. Credit unions are frequently not supported.
21. **No EDI (Electronic Data Interchange):** Large shippers that require EDI 204/210/214 integration cannot be auto-connected. Manual rate confirmation required.
22. **No customer portal self-service:** Shippers cannot log in to view their loads directly. Must call or email dispatch. (Customer portal is planned.)
23. **No carrier-to-carrier subcontract tracking:** Brokered loads to other carriers are tracked manually; no automated carrier settlement flow.

---

## Geographic Limits

24. **US + Mexico only:** IH35-TMS supports US domestic and US-Mexico cross-border operations. Canada is not supported (no CBSA integration, no Canadian tax support, CAD not primary currency).
25. **IFTA reporting is US-based only:** IFTA mileage reporting tracks US states. Canadian provinces not tracked for IFTA.
26. **Customs broker integration is manual:** US and MX customs broker data is stored in the system but EDI/API integration with CBP (US) or SAT (MX) is not implemented.

---

## Tax Limits

27. **Texas-based operations assumed:** Tax calculations assume Texas domicile. Multi-state payroll tax for drivers domiciled in other states is not supported.
28. **Federal + IFTA only:** State property taxes on trucks are tracked as GL entries only. No automated state filing.
29. **Sales tax on loads not computed:** IH35-TMS does not calculate or apply sales tax on freight invoices (freight is typically tax-exempt in Texas, but edge cases are not handled).
30. **No international VAT/GST:** Mexican IVA (16%) on invoices is tracked as a manual line item, not auto-calculated.

---

## UI Limits

31. **No native mobile app:** The driver-facing app (Driver PWA) and office app are Progressive Web Apps (PWAs). They work on mobile browsers but are not installable from the App Store / Google Play. Push notifications require browser permission.
32. **No offline mode:** All features require internet connectivity. There is no offline queue for dispatch or driver updates.
33. **No dark mode:** Light mode only. Dark mode is not implemented.
34. **Tablet layout is not optimized:** UI is designed for desktop (1280px+) and mobile (375px+). Tablet breakpoints (768–1024px) may have layout issues in some modules.
35. **No keyboard shortcut system:** Power users cannot navigate the app via keyboard shortcuts. Mouse/touch required.
36. **Max simultaneous modules open:** Each browser tab runs one module. There is no multi-panel layout for side-by-side comparisons.

---

## Reporting Limits

37. **No scheduled report emails:** Reports must be run manually. There is no way to schedule a report to be emailed daily/weekly automatically. (Planned feature.)
38. **No custom report builder:** Reports are fixed templates. Users cannot create custom reports with arbitrary field selections.
39. **Export formats limited to CSV/PDF:** Reports export as CSV or PDF. Excel (XLSX) with formulas is not supported.
40. **Historical load profitability is approximate:** Load P&L includes direct costs (driver pay, fuel, tolls) but indirect overhead allocation (insurance, depreciation per load) is an estimate.
41. **No cohort analysis:** Customer or driver cohort analysis (e.g., "customers acquired in Q1 2025 — revenue trend") is not available.
42. **QBO ProAdvisor-level reports not replicated:** QBO offers specialized reports (industry KPIs, class-based P&L drill-downs) that are more powerful than IH35's current reporting module.

---

## Multi-Currency

43. **USD is primary currency:** All accounting, settlement, and invoicing defaults to USD. MXN is supported as a display currency only.
44. **MXN-to-USD conversion is manual:** Exchange rates are not auto-fetched. A manual rate must be entered when converting MXN toll/permit amounts to USD.
45. **No real-time FX rates:** No integration with a forex API (Xe, Open Exchange Rates) for automatic rate lookup.

---

## Compliance & Regulatory

46. **No FMCSA API integration:** FMCSA safety scores and carrier lookup are not auto-pulled. Must be checked manually on safer.fmcsa.dot.gov.
47. **Drug & alcohol testing tracking is manual:** Compliance module tracks test completion dates but does not integrate with DISA/Clearinghouse directly.
48. **No ELD mandate gap detection:** IH35 receives HOS data from Samsara but does not independently validate ELD mandate compliance or flag violations.

---

## Data & Privacy

49. **Audit log retention:** Audit logs are retained indefinitely (no automated purge). At scale, this table grows large (see Block 26 partition work).
50. **No GDPR compliance:** IH35-TMS is a US-based system. GDPR data subject requests (right to erasure, data portability) are not implemented. Not applicable for current customer base (US/MX).
51. **No SOC 2 certification:** IH35-TMS is not SOC 2 certified. For enterprise shippers requiring SOC 2, this is a gap.

---

## Recently Resolved

| Limitation | Resolved in | Block |
|---|---|---|
| No cross-border load tracking (MX permits, tolls) | 2026-06-08 | Block 14 |
| No internal mechanic shop accounting | 2026-06-08 | Block 15 |
| No secrets rotation procedure | 2026-06-08 | Block 20 |
| No DR drill procedure or proof | 2026-06-08 | Block 21 |
| No degradation matrix documenting failure modes | 2026-06-08 | Block 23 |
| No canary deploy procedure | 2026-06-08 | Block 27 |
| No vendor lock-in analysis | 2026-06-08 | Block 28 |

---

## Customer-Facing Version

The following is a condensed, customer-appropriate version of limitations for use in sales conversations, RFPs, or shipper onboarding:

---

### IH35-TMS — What You Should Know (Customer Summary)

IH35-TMS is a purpose-built Transportation Management System for IH35 Dispatch operations. Here is a transparent summary of current limitations:

**Geographic coverage:** US domestic and US-Mexico cross-border operations. Canada is not currently supported.

**Mobile access:** Our dispatcher and driver interfaces work on smartphones and tablets through the web browser. There is no dedicated app store download, but the web app can be saved to the home screen for app-like access.

**Reporting:** We offer a robust set of pre-built reports covering revenue, driver pay, fuel, compliance, and P&L by truck. Custom report builders are not available — please request specific reports from our team.

**Invoicing:** Electronic invoicing is available in USD. CFDI (Mexican electronic invoicing) is not yet available — Mexican customers will receive standard PDF invoices.

**EDI:** Automated EDI connections are not currently supported. Rate confirmations and load tenders are handled manually or via email.

**Data exports:** All your data can be exported as CSV at any time.

---

*For questions about a specific limitation or to request a feature, contact Jorge Munoz.*
