# Welcome to IH 35 Dispatch

IH 35 Dispatch is the carrier operating system for IH 35 Transportation and related entities. Office users work in the web app at the company you select; drivers use the separate Driver App (PWA).

## Start here
1. **Pick the operating company** in the header switcher (TRANSP / TRK / USMCA). Every list and create form is scoped to that entity.
2. Open modules from the **left rail** (Dispatch, Drivers, Safety, Maintenance, Banking, Accounting, Factoring, Lists, Help, and more). Your role controls which items appear and what you can change.
3. Use **Help → Overview** for this article index, or **Help → Runbooks** for step-by-step ops procedures.

## How the product is organized
- **Ops:** Dispatch (loads), Drivers, Fleet/units, Maintenance, Fuel, Safety/Compliance.
- **Money:** Accounting, Banking, Factoring, Settlements/Escrow (reach from Finance / Factoring surfaces).
- **Master data:** Customers, Vendors, Lists (catalogs used by pickers).
- **Support:** Tasks, Documents, Help, Program/System (Owner).

## Tips & gotchas
- Primary create buttons say **+ Create** or **+ Book** — never invent IDs in the UI; display IDs come from the server.
- Empty tables can mean “no rows for this company” or a filter — check Active vs All and the company switcher before assuming a bug.
- Money posting and QBO write-back are controlled separately; do not expect TMS to push journals into QuickBooks.
