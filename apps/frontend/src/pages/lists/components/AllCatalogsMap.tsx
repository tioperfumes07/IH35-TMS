import { Link } from "react-router-dom";
import { useCompanyContext } from "../../../contexts/CompanyContext";
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
      { name: "Accident Types", description: "Accident classification codes", live: true, catalogKey: "accident-types" },
      { name: "Workplace Incident Types", description: "Non-vehicle workplace incident categories", live: true, catalogKey: "workplace-incident-types" },
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
      { name: "Dispatch Flag Colors", description: "Board flag colours and their severity order", live: true, catalogKey: "dispatch-flag-colors" },
      { name: "Load Trailer Equipment", description: "Trailer equipment required per load", live: true, catalogKey: "load-trailer-equipment" },
      { name: "Load Types", description: "Linehaul mode/type setup", live: true, catalogKey: "load-types" },
      { name: "Detention Reasons", description: "Detention billing reason catalog", live: true, catalogKey: "detention-reasons" },
      { name: "Pickup Time Types", description: "Pickup scheduling semantics", live: true, catalogKey: "pickup-time-types" },
      { name: "Additional Charges", description: "Accessorial and surcharge templates", live: true, catalogKey: "additional-charges" },
      { name: "Load Cancellation Reasons", description: "Cancellation root-cause reporting taxonomy", live: true, catalogKey: "load-cancellation-reasons" },
      // LST-A-01: per-entity + FORCE RLS, 75 live rows on prod, previously reachable only as a
      // read-only picker inside UserDetail — never from the hub, and with no write path at all.
      { name: "Dispatcher Error Reasons", description: "Dispatcher accountability event reason codes", live: true, catalogKey: "dispatcher-error-reasons" },
      // OWNER RULING 2026-07-28 — every catalog gets a creator wizard. Lumper Providers had no route
      // at all before this.
      { name: "Lumper Providers", description: "Lumper service providers and their codes", live: true, catalogKey: "lumper-providers" },
    ],
  },
  {
    key: "drivers",
    label: "Drivers",
    pillClass: "bg-slate-100 text-slate-700",
    catalogs: [
      { name: "Termination Reasons", description: "Driver separation reason codes", live: true, catalogKey: "termination-reasons" },
      { name: "Cash Advance Types", description: "Driver cash advance categories", live: true, catalogKey: "cash-advance-types" },
      { name: "CDL Endorsements", description: "Commercial licence endorsement codes", live: true, catalogKey: "endorsements" },
      { name: "CDL Restrictions", description: "Commercial licence restriction codes", live: true, catalogKey: "restrictions" },
      { name: "Employment Statuses", description: "Driver employment status values", live: true, catalogKey: "employment-status" },
      { name: "Leave Types", description: "Driver leave categories", live: true, catalogKey: "leave-types" },
      { name: "Medical Card Statuses", description: "DOT medical card status values", live: true, catalogKey: "medical-card-status" },
      { name: "Pay Rate Templates", description: "Driver pay model templates", live: true, catalogKey: "pay-rate-templates" },
      { name: "Driver Deduction Types", description: "Standard deduction reason set", live: true, catalogKey: "deduction-types" },
      { name: "Driver Pay Types", description: "Pay event and compensation code set", live: true, catalogKey: "pay-types" },
      { name: "Escrow Types", description: "Escrow bucket definitions", live: true, catalogKey: "escrow-types" },
      { name: "License Classes", description: "CDL license class reference codes", live: true, catalogKey: "license-classes" },
      // LST-A-01 — catalog was mounted at /catalogs/driver-load-statuses but absent from the hub map.
      { name: "Driver Load Statuses", description: "In-trip / stop status taxonomy for driver updates", live: true, catalogKey: "driver-load-statuses" },
      // LST-F10 — /lists/driver/teams was route-mounted but absent from the hub map (unreachable
      // from nav). buildCatalogPath("drivers","teams") → /lists/driver/teams (drivers→driver).
      { name: "Driver Teams", description: "Primary + secondary driver pairings (team roster)", live: true, catalogKey: "teams" },
    ],
  },
  {
    key: "maintenance",
    label: "Maintenance",
    pillClass: "bg-slate-100 text-slate-700",
    catalogs: [
      { name: "Labor Rates", description: "Billable and internal labor rate codes", live: true, catalogKey: "labor-rates" },
      { name: "Part Locations", description: "Where parts are stored or fitted", live: true, catalogKey: "part-locations" },
      { name: "Air Bag Catalog", description: "Air bag part reference", live: true, catalogKey: "air-bag-catalog" },
      { name: "Battery Catalog", description: "Battery part reference", live: true, catalogKey: "battery-catalog" },
      { name: "PM Intervals", description: "Preventive maintenance interval definitions", live: true, catalogKey: "pm-intervals" },
      { name: "Repair Locations", description: "Where repairs are performed", live: true, catalogKey: "repair-locations" },
      { name: "Tire Catalog", description: "Tire model reference", live: true, catalogKey: "tire-catalog" },
      { name: "Trailer Parts", description: "Trailer part reference", live: true, catalogKey: "trailer-parts" },
      { name: "Truck Parts", description: "Truck part reference", live: true, catalogKey: "truck-parts" },
      { name: "Work Order Templates", description: "Reusable work order definitions", live: true, catalogKey: "work-order-templates" },
      { name: "Maintenance Failure Codes", description: "Failure code taxonomy for diagnostics", live: true, catalogKey: "failure-codes" },
      { name: "Maintenance Labor Codes", description: "Labor operation and billing codes", live: true, catalogKey: "labor-codes" },
      { name: "Maintenance Parts", description: "Parts master with optional SKU metadata", live: true, catalogKey: "parts" },
      // LST-F13 — route-mounted at /lists/maintenance/parts-catalog but absent from DOMAIN_CONFIG,
      // so unreachable from the hub / per-domain hub (only ListsSubNav deep-link).
      { name: "Parts Catalog", description: "Inventory parts catalog surface (qty / SKU grid)", live: true, catalogKey: "parts-catalog" },
      { name: "OEM Parts Reference", description: "Universal OEM part templates by brand (not company inventory)", live: true, catalogKey: "oem-parts-reference" },
      { name: "Maintenance Priority Levels", description: "Priority/severity ladder for work orders", live: true, catalogKey: "priority-levels" },
      { name: "Maintenance Service Tasks", description: "Standard PM and repair task templates", live: true, catalogKey: "service-tasks" },
      { name: "Maintenance Services Catalog", description: "Searchable PM and repair services list with pricing", live: true, catalogKey: "services-catalog" },
      { name: "Maintenance Shop Locations", description: "Internal and vendor repair location set", live: true, catalogKey: "shop-locations" },
      { name: "Maintenance Vendors", description: "Maintenance-specific vendor list", live: true, catalogKey: "vendors" },
      { name: "Work Order Statuses", description: "Lifecycle statuses for maintenance work orders", live: true, catalogKey: "work-order-statuses" },
    ],
  },
  {
    key: "fuel",
    label: "Fuel",
    pillClass: "bg-slate-100 text-slate-700",
    catalogs: [
      { name: "DEF Stations", description: "DEF fill locations", live: true, catalogKey: "def-stations" },
      { name: "Fuel Stations", description: "Fuel stop locations", live: true, catalogKey: "fuel-stations" },
      { name: "Relay Accounts", description: "Relay fuel account references", live: true, catalogKey: "relay-accounts" },
      { name: "Toll Providers", description: "Toll transponder providers", live: true, catalogKey: "toll-providers" },
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
      { name: "Account Types", description: "Chart-of-accounts type lookup", live: true, catalogKey: "account-types-lookup" },
      { name: "Detail Types", description: "Chart-of-accounts detail-type lookup", live: true, catalogKey: "detail-types-lookup" },
      { name: "Audit Event Types", description: "Audit taxonomy — read-only by design", live: true, catalogKey: "audit-event-types" },
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
      // LST-F13 — route-mounted at /lists/accounting/abandonment-defaults but absent from DOMAIN_CONFIG.
      { name: "Abandonment Defaults", description: "Company thresholds for auto-computed abandonment chargebacks", live: true, catalogKey: "abandonment-defaults" },
    ],
  },
  {
    // LST-A-01: the hub had no customers domain at all, so a per-entity customer catalog with 72 live
    // rows on prod had nowhere to appear. Adding the domain is what makes it reachable.
    key: "customers",
    label: "Customers",
    pillClass: "bg-slate-100 text-slate-700",
    catalogs: [
      // C-01 — the Lists hub must enter the canonical customer roster, where +Create writes the
      // same mdata.customers rows consumed by customer pickers. Customer Types alone is not that
      // operational chain.
      { name: "Customers", description: "Customer roster, profiles, and +Create", live: true, catalogKey: "customers-master" },
      { name: "Customer Types", description: "QuickBooks-style customer classification", live: true, catalogKey: "customer-types" },
      { name: "Customer Quality Event Reasons", description: "Customer service-quality event reason codes", live: true, catalogKey: "customer-quality-event-reasons" },
    ],
  },
  {
    key: "vendors",
    label: "Vendors",
    pillClass: "bg-slate-100 text-slate-700",
    catalogs: [
      // C-02 — enter the canonical vendor roster from Lists so +Create writes mdata.vendors rows
      // consumed by bill, expense, maintenance, and insurance vendor pickers.
      { name: "Vendors", description: "Vendor roster, profiles, and +Create", live: true, catalogKey: "vendors-master" },
      // LST-WIRE-04 — vendor types were a frozen TypeScript union in the vendor create form. The
      // catalog existed, seeded per entity, and nothing read it: the owner could pick a type but
      // never add, rename or retire one. This tile is the operator's way in.
      { name: "Vendor Types", description: "Vendor classification codes (Fuel, Repair, Tires…)", live: true, catalogKey: "vendor-types" },
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
  {
    // LST-F20d — global reference data: no operating_company_id, identical for every entity, and
    // deliberately view-only. States feed driver/customer address validation; an operator does not
    // invent a 57th US state, and QBO/NetSuite/McLeod all treat these as system reference too.
    key: "reference",
    label: "Reference",
    pillClass: "bg-slate-100 text-slate-700",
    catalogs: [
      { name: "US States", description: "US states and territories — view only", live: true, catalogKey: "us-states" },
      { name: "Mexico States", description: "Mexican states — view only", live: true, catalogKey: "mexico-states" },
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

/** Map a /lists/:domain route param to a DOMAIN_CONFIG hub key, if any. */
export function resolveListsDomainHubKey(routeDomain: string, config: DomainConfig[] = DOMAIN_CONFIG): string | undefined {
  if (findDomainByKey(routeDomain, config)) return routeDomain;
  if (routeDomain === "driver" && findDomainByKey("drivers", config)) return "drivers";
  if (routeDomain === "names" && findDomainByKey("names_master", config)) return "names_master";
  return undefined;
}


/** Live operating-module route for a Lists domain (reverse_link: catalog hub → module). */
export function buildDomainModulePath(domainKey: string): string | null {
  const map: Record<string, string> = {
    safety: "/safety",
    maintenance: "/maintenance",
    dispatch: "/dispatch",
    fuel: "/fuel",
    drivers: "/drivers",
    fleet: "/fleet",
    accounting: "/accounting",
    customers: "/customers",
    vendors: "/vendors",
    names_master: "/lists/names",
  };
  return map[domainKey] ?? null;
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
  // Accounting flyout "+ Create new catalog" must open CoA AccountDrawer chrome — not the domain
  // hub card list (CURSOR-LISTS-LIVE-CHROME-2026-08-15 step 3 FAIL: hub Create → dialogCount=0).
  if (catalogKey === "_create") {
    if (domain === "accounting" || routeDomain === "accounting") {
      return "/lists/accounting/chart-of-accounts?create=1";
    }
    // LST-F5216/5217 — flyout Create opens a createable live catalog (+ ?create=1), not hub-only.
    // Prefer leaves that already honor useCreateQueryParam (avoid unmounted/legacy first cards).
    const preferredByDomain: Record<string, string> = {
      safety: "internal-fine-reasons",
      dispatch: "dispatch-flag-colors",
      drivers: "termination-reasons",
      maintenance: "labor-rates",
      fuel: "card-types",
      fleet: "equipment-types",
    };
    const cfg = DOMAIN_CONFIG.find((d) => d.key === domain || d.key === routeDomain);
    const preferredKey = preferredByDomain[domain] ?? preferredByDomain[routeDomain];
    const preferred =
      (preferredKey && cfg?.catalogs.find((c) => c.live && c.catalogKey === preferredKey)) ||
      cfg?.catalogs.find((c) => c.live && c.catalogKey);
    if (preferred?.catalogKey) {
      const base = buildCatalogPath(domain, preferred.catalogKey);
      return base.includes("?") ? `${base}&create=1` : `${base}?create=1`;
    }
    return `/lists/hub/${domain}`;
  }
  if (domain === "customers" && catalogKey === "customers-master") return "/customers";
  if (domain === "vendors" && catalogKey === "vendors-master") return "/vendors";
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
      "driver-load-statuses": "/lists/drivers/driver-load-statuses",
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
  if (domain === "accounting") {
    // "Account Types" hub card used account-types-lookup (generic factory) which 500'd because
    // catalogs.account_types has no updated_at. Prefer the dedicated taxonomy page; lookup API
    // is still fixed for any deep link to /lists/accounting/account-types-lookup.
    if (catalogKey === "account-types-lookup") return "/lists/accounting/account-types";
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
  const { selectedCompany } = useCompanyContext();
  // USMCA/TRK are TMS-native — QBO bulk-link is TRANSP-only (sync-health twin #8751).
  const qboAvailable = selectedCompany?.code === "TRANSP";
  const catalogs = domain.catalogs.filter(
    (catalog) => catalog.catalogKey !== "qbo-bulk-link" || qboAvailable,
  );

  return (
    <div id={listsDomainSectionId(domain.key)} className="rounded-sm border border-slate-100 px-2 py-2 text-xs">
      <div className="mb-2 flex items-center justify-between gap-3">
        {onDomainClick ? (
          <button
            type="button"
            data-testid="domain-header-link"
            onClick={() => onDomainClick(domain.key)}
            className={`rounded-sm px-2 py-0.5 font-semibold hover:underline focus:outline-hidden focus:ring-2 focus:ring-slate-400 ${domain.pillClass}`}
          >
            {domain.label}
          </button>
        ) : (
          <span className={`rounded-sm px-2 py-0.5 font-semibold ${domain.pillClass}`}>{domain.label}</span>
        )}
        <div className="flex items-center gap-2">
          {buildDomainModulePath(domain.key) ? (
            <Link
              to={buildDomainModulePath(domain.key)!}
              data-testid={`lists-domain-open-module-${domain.key}`}
              className="text-[10px] font-semibold text-slate-600 underline hover:text-slate-900"
            >
              Open {domain.label} module
            </Link>
          ) : null}
          {/* #P3 parity — live row count via the same useModuleCount source as the ribbon badge. */}
          <DomainRowCountBadge domain={domain.key} className="rounded-sm bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600" />
        </div>
      </div>
      <div className="grid gap-1.5 md:grid-cols-2">
        {catalogs.map((catalog) => (
          <div key={`${domain.key}-${catalog.name}`} className="rounded-sm border border-slate-100 px-2 py-1.5">
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
    <div className="rounded-sm border border-slate-200 bg-white p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">All Catalogs Domain Map</div>
      <div className="space-y-2">
        {domains.map((domain) => (
          <DomainCatalogSection key={domain.key} domain={domain} onCatalogClick={onCatalogClick} onDomainClick={onDomainClick} />
        ))}
      </div>
    </div>
  );
}
