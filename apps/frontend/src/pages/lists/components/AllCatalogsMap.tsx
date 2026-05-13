type CatalogItem = {
  name: string;
  description: string;
  live: boolean;
  catalogKey?: string;
};

type DomainConfig = {
  key: string;
  label: string;
  pillClass: string;
  catalogs: CatalogItem[];
};

const DOMAIN_CONFIG: DomainConfig[] = [
  {
    key: "safety",
    label: "Safety",
    pillClass: "bg-red-50 text-red-700",
    catalogs: [
      { name: "Internal Fine Reasons", description: "Default internal penalty reason codes", live: true, catalogKey: "internal-fine-reasons" },
      { name: "Civil Fine Types", description: "External citation/fine category definitions", live: true, catalogKey: "civil-fine-types" },
      { name: "Company Violation Types", description: "Policy and integrity violation code set", live: true, catalogKey: "company-violation-types" },
      { name: "Complaint Types", description: "Driver and customer complaint classifications", live: false },
      { name: "DOT Violation Types", description: "Inspection and DOT offense groupings", live: false },
      { name: "Cargo Claim Reasons", description: "Claim cause categories for safety/legal", live: false },
    ],
  },
  {
    key: "dispatch",
    label: "Dispatch",
    pillClass: "bg-blue-50 text-blue-700",
    catalogs: [
      { name: "Load Types", description: "Linehaul mode/type setup", live: true, catalogKey: "load-types" },
      { name: "Detention Reasons", description: "Detention billing reason catalog", live: true, catalogKey: "detention-reasons" },
      { name: "Pickup Time Types", description: "Pickup scheduling semantics", live: true, catalogKey: "pickup-time-types" },
      { name: "Additional Charges", description: "Accessorial and surcharge templates", live: true, catalogKey: "additional-charges" },
      { name: "Load Cancellation Reasons", description: "Cancellation root-cause reporting taxonomy", live: false },
    ],
  },
  {
    key: "driver",
    label: "Drivers",
    pillClass: "bg-green-50 text-green-700",
    catalogs: [
      { name: "Pay Rate Templates", description: "Driver pay model templates", live: true, catalogKey: "pay-rate-templates" },
      { name: "Driver Deduction Types", description: "Standard deduction reason set", live: true, catalogKey: "deduction-types" },
      { name: "Driver Pay Types", description: "Pay event and compensation code set", live: true, catalogKey: "pay-types" },
      { name: "Escrow Types", description: "Escrow bucket definitions", live: true, catalogKey: "escrow-types" },
      { name: "Termination Reasons", description: "Offboarding reason taxonomy", live: false },
    ],
  },
  {
    key: "maintenance",
    label: "Maintenance",
    pillClass: "bg-slate-100 text-slate-700",
    catalogs: [
      { name: "Maintenance Failure Codes", description: "Failure code taxonomy for diagnostics", live: true, catalogKey: "failure-codes" },
      { name: "Maintenance Labor Codes", description: "Labor operation and billing codes", live: true, catalogKey: "labor-codes" },
      { name: "Maintenance Parts", description: "Parts master with optional SKU metadata", live: true, catalogKey: "parts" },
      { name: "Maintenance Priority Levels", description: "Priority/severity ladder for work orders", live: true, catalogKey: "priority-levels" },
      { name: "Maintenance Service Tasks", description: "Standard PM and repair task templates", live: true, catalogKey: "service-tasks" },
      { name: "Maintenance Shop Locations", description: "Internal and vendor repair location set", live: true, catalogKey: "shop-locations" },
      { name: "Maintenance Vendors", description: "Maintenance-specific vendor list", live: true, catalogKey: "vendors" },
      { name: "Work Order Statuses", description: "Lifecycle statuses for maintenance work orders", live: true, catalogKey: "work-order-statuses" },
    ],
  },
  {
    key: "fuel",
    label: "Fuel",
    pillClass: "bg-amber-50 text-amber-700",
    catalogs: [
      { name: "Fuel Card Types", description: "Fuel card program and method types", live: true, catalogKey: "card-types" },
      { name: "Fuel Exception Types", description: "Fuel anomaly and exception categories", live: true, catalogKey: "exception-types" },
      { name: "Fuel Station Brands", description: "Station brand catalog with partner metadata", live: true, catalogKey: "station-brands" },
      { name: "Fuel Stop Reason Codes", description: "Operational reasons for planned fuel stops", live: true, catalogKey: "stop-reason-codes" },
      { name: "MPG Bands", description: "Efficiency ranges for MPG monitoring", live: true, catalogKey: "mpg-bands" },
      { name: "Expensive States", description: "High-cost fuel states to avoid when possible", live: true, catalogKey: "expensive-states" },
      { name: "Fuel Tax Jurisdictions", description: "Fuel tax jurisdiction registry (US/CA)", live: true, catalogKey: "tax-jurisdictions" },
    ],
  },
  {
    key: "fleet",
    label: "Fleet",
    pillClass: "bg-purple-50 text-purple-700",
    catalogs: [
      { name: "Tractor Statuses", description: "Lifecycle statuses for tractor units", live: true, catalogKey: "tractor-statuses" },
      { name: "Trailer Statuses", description: "Lifecycle statuses for trailer units", live: true, catalogKey: "trailer-statuses" },
      { name: "Condition Codes", description: "Standardized condition grading for fleet assets", live: true, catalogKey: "condition-codes" },
      { name: "Equipment Types", description: "Tractor/trailer equipment type taxonomy", live: true, catalogKey: "equipment-types" },
      { name: "Tire Positions", description: "Fixed tire positions for standard fleet setup", live: true, catalogKey: "tire-positions" },
      { name: "Ownership Types", description: "Owned/leased/rented categorization", live: true, catalogKey: "ownership-types" },
    ],
  },
  {
    key: "accounting",
    label: "Accounting",
    pillClass: "bg-slate-200 text-slate-800",
    catalogs: [
      { name: "Chart of Accounts", description: "GL account catalog and hierarchy", live: true, catalogKey: "chart-of-accounts" },
      { name: "Classes", description: "Operational and financial classification tags", live: true, catalogKey: "classes" },
      { name: "Payment Terms", description: "Net-term and due-date definitions", live: true, catalogKey: "payment-terms" },
      { name: "Posting Templates", description: "Code-managed debit/credit posting templates", live: true, catalogKey: "posting-templates" },
      { name: "Journal Entry Types", description: "Journal source and purpose classifications", live: true, catalogKey: "journal-entry-types" },
      { name: "QBO Categories", description: "QuickBooks category and mapping helper list", live: true, catalogKey: "qbo-categories" },
      { name: "Items", description: "Invoiceable services and products catalog", live: true, catalogKey: "items" },
      { name: "Account Role Bindings", description: "Role-to-account mapping controls (read-only v1)", live: true, catalogKey: "account-role-bindings" },
    ],
  },
  {
    key: "names_master",
    label: "Names master",
    pillClass: "bg-orange-50 text-orange-700",
    catalogs: [
      { name: "Shippers", description: "Canonical shipper naming set", live: false },
      { name: "Consignees", description: "Canonical consignee naming set", live: false },
      { name: "Brokers", description: "Broker naming and aliases", live: false },
      { name: "Lenders", description: "Finance partner naming set", live: false },
      { name: "Insurance Carriers", description: "Insurance provider directory names", live: false },
    ],
  },
];

type Props = {
  onCatalogClick: (domain: string, catalogKey: string) => void;
};

export function AllCatalogsMap({ onCatalogClick }: Props) {

  return (
    <div className="rounded border border-slate-200 bg-white p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">All Catalogs Domain Map</div>
      <div className="space-y-2">
        {DOMAIN_CONFIG.map((domain) => {
          return (
            <div key={domain.key} className="rounded border border-slate-100 px-2 py-2 text-xs">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className={`rounded px-2 py-0.5 font-semibold ${domain.pillClass}`}>{domain.label}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{domain.catalogs.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                {domain.catalogs.map((catalog) => (
                  <div key={`${domain.key}-${catalog.name}`} className="rounded border border-slate-100 px-2 py-1.5">
                    {catalog.live && catalog.catalogKey ? (
                      <button type="button" className="text-left font-semibold text-blue-700 hover:underline" onClick={() => onCatalogClick(domain.key, catalog.catalogKey ?? "")}>
                        {catalog.name}
                      </button>
                    ) : (
                      <div className="font-semibold text-slate-500">
                        {catalog.name} <span className="text-[10px] uppercase tracking-wide">(coming soon)</span>
                      </div>
                    )}
                    <div className="text-[11px] text-slate-500">{catalog.description}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

