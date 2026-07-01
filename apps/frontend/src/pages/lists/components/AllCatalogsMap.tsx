import { CATALOG_IN_PREPARATION } from "../../../lib/prodEmptyStateCopy";
import { DomainRowCountBadge } from "./DomainRowCountBadge";

export type CatalogItem = {
  name: string;
  description: string;
  live: boolean;
  catalogKey?: string;
};

export type DomainConfig = {
  key: string;
  label: string;
  pillClass: string;
  catalogs: CatalogItem[];
};

// Single source of truth for the Lists domain map. Both AllCatalogsMap (main hub) and
// DomainCatalogHubPage (per-domain hub) render from this same array via sortDomainsForDisplay —
// never a second hand-ordered copy, so a newly-added catalog auto-places by name.
export const DOMAIN_CONFIG: DomainConfig[] = [
  {
    key: "safety",
    label: "Safety",
    pillClass: "bg-red-50 text-red-700",
    catalogs: [
      { name: "Internal Fine Reasons", description: "Default internal penalty reason codes", live: true, catalogKey: "internal-fine-reasons" },
      { name: "Civil Fine Types", description: "External citation/fine category definitions", live: true, catalogKey: "civil-fine-types" },
      { name: "Company Violation Types", description: "Policy and integrity violation code set", live: true, catalogKey: "company-violation-types" },
      { name: "Complaint Types", description: "Driver and customer complaint classifications", live: true, catalogKey: "complaint-types" },
      { name: "DOT Violation Types", description: "Inspection and DOT offense groupings", live: true, catalogKey: "dot-violation-types" },
      { name: "Cargo Claim Reasons", description: "Claim cause categories for safety/legal", live: true, catalogKey: "cargo-claim-reasons" },
    ],
  },
  {
    key: "dispatch",
    label: "Dispatch",
    pillClass: "bg-slate-100 text-slate-700",
    catalogs: [
      { name: "Load Types", description: "Linehaul mode/type setup", live: true, catalogKey: "load-types" },
      { name: "Detention Reasons", description: "Detention billing reason catalog", live: true, catalogKey: "detention-reasons" },
      { name: "Pickup Time Types", description: "Pickup scheduling semantics", live: true, catalogKey: "pickup-time-types" },
      { name: "Additional Charges", description: "Accessorial and surcharge templates", live: true, catalogKey: "additional-charges" },
      { name: "Load Cancellation Reasons", description: "Cancellation root-cause reporting taxonomy", live: true, catalogKey: "load-cancellation-reasons" },
    ],
  },
  {
    key: "drivers",
    label: "Drivers",
    pillClass: "bg-green-50 text-green-700",
    catalogs: [
      { name: "Pay Rate Templates", description: "Driver pay model templates", live: true, catalogKey: "pay-rate-templates" },
      { name: "Driver Deduction Types", description: "Standard deduction reason set", live: true, catalogKey: "deduction-types" },
      { name: "Driver Pay Types", description: "Pay event and compensation code set", live: true, catalogKey: "pay-types" },
      { name: "Escrow Types", description: "Escrow bucket definitions", live: true, catalogKey: "escrow-types" },
      { name: "License Classes", description: "CDL license class reference codes", live: true, catalogKey: "license-classes" },
      { name: "CDL Endorsements", description: "Endorsement code reference set", live: true, catalogKey: "endorsements" },
      { name: "CDL Restrictions", description: "Restriction code reference set", live: true, catalogKey: "restrictions" },
      { name: "Medical Card Status", description: "DOT medical card status codes", live: true, catalogKey: "medical-card-status" },
      { name: "Employment Status", description: "Driver employment classification codes", live: true, catalogKey: "employment-status" },
      { name: "Termination Reasons", description: "Offboarding reason taxonomy", live: true, catalogKey: "termination-reasons" },
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
      { name: "OEM Parts Reference", description: "Universal OEM part templates by brand (not company inventory)", live: true, catalogKey: "oem-parts-reference" },
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
      { name: "Fuel Brands", description: "Brand groupings for station and network planning", live: true, catalogKey: "brands" },
      { name: "Fuel Station States", description: "US state codes used for fuel station taxonomy", live: true, catalogKey: "station-states" },
      { name: "Fuel Pump Types", description: "Dispenser / island pump classifications", live: true, catalogKey: "pump-types" },
      { name: "Fuel Grades", description: "Diesel / DEF / mid-grade product codes", live: true, catalogKey: "grades" },
      { name: "Fuel Dispatch Routes", description: "Named lane strings for fuel planning", live: true, catalogKey: "dispatch-routes" },
    ],
  },
  {
    key: "fleet",
    label: "Fleet",
    pillClass: "bg-slate-100 text-slate-700",
    catalogs: [
      { name: "Tractor Statuses", description: "Lifecycle statuses for tractor units", live: true, catalogKey: "tractor-statuses" },
      { name: "Trailer Statuses", description: "Lifecycle statuses for trailer units", live: true, catalogKey: "trailer-statuses" },
      { name: "Condition Codes", description: "Standardized condition grading for fleet assets", live: true, catalogKey: "condition-codes" },
      { name: "Equipment Types", description: "Tractor/trailer equipment type taxonomy", live: true, catalogKey: "equipment-types" },
      { name: "Tire Positions", description: "Fixed tire positions for standard fleet setup", live: true, catalogKey: "tire-positions" },
      { name: "Ownership Types", description: "Owned/leased/rented categorization", live: true, catalogKey: "ownership-types" },
      { name: "Trailer Types", description: "Trailer body / equipment family codes", live: true, catalogKey: "trailer-types" },
      { name: "Lease Terms", description: "Finance and lease duration buckets", live: true, catalogKey: "lease-terms" },
      { name: "Asset Statuses", description: "Fleet asset lifecycle outside tractor/trailer statuses", live: true, catalogKey: "asset-statuses" },
      { name: "Asset Locations", description: "Yard, shop, and third-party location codes", live: true, catalogKey: "asset-locations" },
    ],
  },
  {
    key: "accounting",
    label: "Accounting",
    pillClass: "bg-slate-200 text-slate-800",
    catalogs: [
      { name: "Chart of Accounts", description: "GL account catalog and hierarchy", live: true, catalogKey: "chart-of-accounts" },
      { name: "Account Type", description: "Fixed account-type taxonomy (read-only reference)", live: true, catalogKey: "account-types" },
      { name: "Detail Type", description: "Account-type sub-classifications: canonical system set + per-entity custom", live: true, catalogKey: "detail-types" },
      { name: "Classes", description: "Operational and financial classification tags", live: true, catalogKey: "classes" },
      { name: "Payment Terms", description: "Net-term and due-date definitions", live: true, catalogKey: "payment-terms" },
      { name: "Posting Templates", description: "Code-managed debit/credit posting templates", live: true, catalogKey: "posting-templates" },
      { name: "Journal Entry Types", description: "Journal source and purpose classifications", live: true, catalogKey: "journal-entry-types" },
      { name: "QBO bulk-link", description: "Match drivers and assets to QBO vendors/classes", live: true, catalogKey: "qbo-bulk-link" },
      { name: "Product & Service Categories", description: "Groups items for sales reporting (no GL account link)", live: true, catalogKey: "qbo-categories" },
      { name: "Items", description: "Invoiceable services and products catalog", live: true, catalogKey: "items" },
      { name: "Account Role Bindings", description: "Role-to-account mapping controls (read-only v1)", live: true, catalogKey: "account-role-bindings" },
      { name: "Chart of Accounts Seeds", description: "Per-company template rows for onboarding GL", live: true, catalogKey: "chart-of-accounts-seeds" },
      { name: "Expense Categories", description: "AP / expense categorization for operations", live: true, catalogKey: "expense-categories" },
      { name: "Payment Methods", description: "Cash application and disbursement rails", live: true, catalogKey: "payment-methods" },
      { name: "Tax Codes", description: "Sales and use tax buckets (map to QBO as wired)", live: true, catalogKey: "tax-codes" },
      { name: "Currency Codes", description: "ISO currency list for multi-currency hints", live: true, catalogKey: "currency-codes" },
      { name: "Void/Cancel Reasons", description: "Financial void/cancel reason catalog (invoices, bills, payments, JEs, settlements, WO voids)", live: true, catalogKey: "void-cancel-reasons" },
    ],
  },
  {
    key: "names_master",
    label: "Names master",
    pillClass: "bg-orange-50 text-orange-700",
    catalogs: [
      { name: "Shippers", description: "Canonical shipper naming set", live: false },
      { name: "Consignees", description: "Canonical consignee naming set", live: false },
      { name: "Brokers", description: "Broker naming and aliases", live: true, catalogKey: "brokers" },
      { name: "Lenders", description: "Finance partner naming set", live: false },
      { name: "Insurance Carriers", description: "Insurance provider directory names", live: false },
    ],
  },
];

// Accounting is pinned FIRST; every other domain follows alphabetically by label; catalogs within
// each domain are alphabetical by name. Pure + data-driven so new catalogs auto-place (no drift).
export function sortDomainsForDisplay(config: DomainConfig[] = DOMAIN_CONFIG): DomainConfig[] {
  const byLabel = (a: DomainConfig, b: DomainConfig) => a.label.localeCompare(b.label);
  const accounting = config.filter((d) => d.key === "accounting").sort(byLabel);
  const rest = config.filter((d) => d.key !== "accounting").sort(byLabel);
  return [...accounting, ...rest].map((domain) => ({
    ...domain,
    catalogs: [...domain.catalogs].sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

export function findDomainByKey(key: string, config: DomainConfig[] = DOMAIN_CONFIG): DomainConfig | undefined {
  return config.find((d) => d.key === key);
}

export function listsDomainSectionId(domainKey: string): string {
  return `lists-domain-${domainKey}`;
}

function normalizeListsDomain(domain: string): string {
  if (domain === "drivers") return "driver";
  return domain;
}

// Single route resolver shared by the main hub and every per-domain hub. Centralizing the per-domain
// route maps here (was inline in ListsHubPage.openCatalog) keeps navigation from diverging between
// the two surfaces.
export function buildCatalogPath(domain: string, catalogKey: string): string {
  const routeDomain = normalizeListsDomain(domain);
  if (catalogKey === "_create") return `/lists/${routeDomain}`;
  if (domain === "dispatch") {
    const dispatchRouteMap: Record<string, string> = {
      "load-types": "/lists/dispatch/load-types",
      load_types: "/lists/dispatch/load-types",
      "detention-reasons": "/lists/dispatch/detention-reasons",
      detention_reasons: "/lists/dispatch/detention-reasons",
      "pickup-time-types": "/lists/dispatch/pickup-time-types",
      pickup_time_types: "/lists/dispatch/pickup-time-types",
      "additional-charges": "/lists/dispatch/additional-charges",
      additional_charges: "/lists/dispatch/additional-charges",
      "load-cancellation-reasons": "/lists/dispatch/load-cancellation-reasons",
      load_cancellation_reasons: "/lists/dispatch/load-cancellation-reasons",
    };
    const dispatchPath = dispatchRouteMap[catalogKey];
    if (dispatchPath) return dispatchPath;
  }
  if (domain === "names_master") {
    if (catalogKey === "brokers") return "/lists/names/brokers";
    return "/lists/names";
  }
  if (domain === "drivers") {
    const driversReferenceRouteMap: Record<string, string> = {
      "license-classes": "/lists/drivers/license-classes",
      endorsements: "/lists/drivers/endorsements",
      restrictions: "/lists/drivers/restrictions",
      "medical-card-status": "/lists/drivers/medical-card-status",
      "employment-status": "/lists/drivers/employment-status",
      "termination-reasons": "/lists/drivers/termination-reasons",
    };
    const driversReferencePath = driversReferenceRouteMap[catalogKey];
    if (driversReferencePath) return driversReferencePath;
  }
  if (domain === "maintenance") {
    const maintenanceRouteMap: Record<string, string> = {
      "oem-parts-reference": "/lists/maintenance/oem-parts-reference",
    };
    const maintenancePath = maintenanceRouteMap[catalogKey];
    if (maintenancePath) return maintenancePath;
  }
  return `/lists/${routeDomain}/${catalogKey}`;
}

type DomainSectionProps = {
  domain: DomainConfig;
  onCatalogClick: (domain: string, catalogKey: string) => void;
  onDomainClick?: (domainKey: string) => void;
};

// One domain's card — header + catalog grid. Reused by AllCatalogsMap and DomainCatalogHubPage so
// both surfaces render identically from DOMAIN_CONFIG.
export function DomainCatalogSection({ domain, onCatalogClick, onDomainClick }: DomainSectionProps) {
  return (
    <div id={listsDomainSectionId(domain.key)} className="rounded border border-slate-100 px-2 py-2 text-xs">
      <div className="mb-2 flex items-center justify-between gap-3">
        {onDomainClick ? (
          <button
            type="button"
            data-testid="domain-header-link"
            onClick={() => onDomainClick(domain.key)}
            className={`rounded px-2 py-0.5 font-semibold hover:underline focus:outline-none focus:ring-2 focus:ring-slate-400 ${domain.pillClass}`}
          >
            {domain.label}
          </button>
        ) : (
          <span className={`rounded px-2 py-0.5 font-semibold ${domain.pillClass}`}>{domain.label}</span>
        )}
        {/* #P3 parity — live row count via the same useModuleCount source as the ribbon badge. */}
        <DomainRowCountBadge domain={domain.key} className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600" />
      </div>
      <div className="grid gap-1.5 md:grid-cols-2">
        {domain.catalogs.map((catalog) => (
          <div key={`${domain.key}-${catalog.name}`} className="rounded border border-slate-100 px-2 py-1.5">
            {catalog.live && catalog.catalogKey ? (
              <button type="button" className="text-left font-semibold text-slate-700 hover:underline" onClick={() => onCatalogClick(domain.key, catalog.catalogKey ?? "")}>
                {catalog.name}
              </button>
            ) : (
              <div className="font-semibold text-slate-500">
                {catalog.name} <span className="text-[10px] uppercase tracking-wide">({CATALOG_IN_PREPARATION})</span>
              </div>
            )}
            <div className="text-[11px] text-slate-500">{catalog.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

type Props = {
  onCatalogClick: (domain: string, catalogKey: string) => void;
  onDomainClick?: (domainKey: string) => void;
};

export function AllCatalogsMap({ onCatalogClick, onDomainClick }: Props) {
  const domains = sortDomainsForDisplay(DOMAIN_CONFIG);
  return (
    <div className="rounded border border-slate-200 bg-white p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">All Catalogs Domain Map</div>
      <div className="space-y-2">
        {domains.map((domain) => (
          <DomainCatalogSection key={domain.key} domain={domain} onCatalogClick={onCatalogClick} onDomainClick={onDomainClick} />
        ))}
      </div>
    </div>
  );
}
