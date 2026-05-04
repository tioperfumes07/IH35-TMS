# Approved UI Design Screenshots — May 2, 2026

These 13 screenshots are the authoritative visual reference approved by Jorge in the May 2 preview session. They are the source of truth for **BT-1-WEB-01** (Office Web UI) and **BT-1-PWA-01** (Driver PWA). The text in `../approved-ui-designs.md` is the design system specification; the PNGs in this folder are the visual ground truth.

## Screen index

| # | File | Module | Design tokens locked |
|---|---|---|---|
| 01 | 01-home.png | Home / Workspace snapshot | 48px topbar, 7 KPI cards 30px tall, 8 section quick-jumps with 3-day count badges, Today's Attention List with CRIT/WARN/INFO chips, Fleet Snapshot panel |
| 02 | 02-maintenance.png | Maintenance | 30px KPI cards single-row layout, Create Work Order pill buttons (PM/Repair/Tire/Accident), 3-panel grid (In-House/External/Roadside), Severe Repair OOS panel, In-Transit Issues with Triage button |
| 03 | 03-accounting-dropdown.png | Accounting | Hover-dropdown sub-nav with `white-space: nowrap`, Bills▾ dropdown sized to longest line ("Maintenance bill"), Past-Due Bills panel, QBO Sync Queue, Driver Balances Owed Top 5 |
| 04 | 04-banking.png | Banking | Factoring as Virtual Bank panel, Driver Escrow Visualizer, Categorize drawer with smart-match suggestions, sub-nav with Categorize▾, KPIs (Cash Position, DIP Balance, Uncategorized, Reconciled, Factoring Res, Escrow Held) |
| 05 | 05-fuel-planner.png | Fuel | HOS-aware route diagram (green/gold/red dots), Trip Plan Summary, Recommendation vs Actual Compliance tracker, Active Trip strip with HOS clocks |
| 06 | 06-safety.png | Safety | 8-tile sub-area grid (HOS, HOS Clocks, Antidoping, Accidents, Complaints, Civil Fines, Internal Fines, DOT Inspections), color-coded urgency, Workers Comp added to sub-nav, Open Accident Files panel, Driver Compliance Expirations |
| 07 | 07-drivers.png | Drivers | 4-up uniform grid panels, header bands 20px, data rows 22px, 8px text, Settlements Ready with debt offset, Active Drivers Samsara Live with 5-state colors (driving green / sleeper gray / on-duty waiting gold / off-duty reset blue / violation red) |
| 07b | 07b-drivers-reasoning.png | Drivers (design rationale) | Reasoning preview showing how the 4-up grid was sized; reference for layout decisions |
| 08 | 08-dispatch.png | Dispatch | KPIs (Dispatched / Need Load / Delivered / In Transit / Proj Inv Wk / Deadhead / MPG), single-line sub-nav, locked column order (Load# / Unit / Trailer / WO / Temp / Driver / Start / End / Customer / Origin→Destination / Status), Units With Load + Units Without Load split |
| 09 | 09-lists-catalogs.png | Lists & Catalogs | Hover-dropdown hub, color-coded domain headers (Safety red, Maintenance gray, Dispatch blue, Fuel gold, Drivers green, Fleet purple, Accounting/Names neutral), bidirectional QBO sync footer, KPIs (master names, QBO-synced, pending, edited 7d, last sync) |
| 10 | 10-reports.png | Reports | Hover-dropdown report library (All / Operations / Financial / Drivers / Fleet / Fuel / Safety / Compliance / Saved), Frequently Run This Week panel, Scheduled Auto-Emailed panel, IFTA Quarterly Preparer 4-step gold-bordered |
| 11 | 11-form-425c.png | Form 425C | Monthly Operating Report layout, all 37 lines, Auto-Fill Source Map, Exhibits A-F Auto-Built, Pre-File Checklist, Generate PDF button, period selector |
| 12 | 12-driver-app.png | Driver PWA | DARK THEME #0F1219, HOS grid (Drive 8h12m / Shift 11h04m / 70H 42h / Tank 21%), Active Load card with Status/Directions/Docs buttons, Next Fuel recommendation with savings, 4 action buttons (Pre-trip / Log fuel / Upload BOL / Report issue), Report Issue with 6 categorized buttons + photo upload + Samsara DTC auto-attach |

## Locked decisions visible in screenshots

- **Topbar:** 48px tall, "IH 35 TRANSPORTATION LLC" + green dot status + "QuickBooks · Samsara · Relay connected" pill + date/time + user name
- **Sidebar:** 72px wide, ~12 module icons in locked order (HOME / MAINT / ACCTG / BANK / FUEL / SAFETY / DRIVERS / DISPATCH / LISTS / REPORTS / 425C / DRV APP), checkbox-style active indicator
- **All sub-nav rows:** 1.5px underline tab pattern
- **All hover dropdowns:** white-space: nowrap, sized to longest line, no quantities or descriptors
- **Two-Section yellow/green band pattern** for cost-breakdown forms (Create Expense, Create Bill, Bill Payment)
- **Status badges:** 5-state palette (red CRIT, gold WARN, blue INFO, green OK, gray INACTIVE)
- **Driver Samsara Live colors:** green driving / gray sleeper / gold on-duty waiting / blue off-duty reset / red on-duty violation
- **Driver app uses different dark token set (#0F1219 background)** — only place in system that uses dark theme

## Change control

Any UI work that deviates from these screenshots requires a Section E entry in the relevant phase tracker (docs/trackers/phase-N.md). Substantive changes (new modules, removal of panels, changed KPIs, color changes) require a v3.X amendment to the Master Blueprint.

