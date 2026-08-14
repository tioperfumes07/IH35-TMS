import type { MouseEvent, ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * EntityLink — the shared drill-through primitive for total-connectivity (LAW OF THE LAND).
 *
 * Renders an entity id as a clickable link to that entity's real detail route, or as plain
 * text when no per-id detail route exists yet (never fabricates a route — see the resolver
 * comments below for the exact gaps, verified against routes/manifest.tsx).
 *
 * This consolidates the drill-through pattern already used (inconsistently, and in a few
 * places incorrectly — e.g. IntegrationTransactionsPage linking to a nonexistent
 * /accounting/bills/:id, and AuditTrailPage's sourceLink doing the same) across
 * AccountsPayableAgingPage, AccountRegisterPage, VendorsListView, CustomersListView,
 * DriversTable, and others: a react-router `<Link>` styled `text-slate-700 hover:underline`
 * (the locked §7 slate token, apps/frontend/src/design/tokens.ts).
 */

export type EntityKind =
  | "load"
  | "bill"
  | "invoice"
  | "settlement"
  | "journal_entry"
  | "vendor"
  | "customer"
  | "unit"
  | "driver"
  | "trailer"
  | "expense"
  | "liability"
  | "bank_account"
  | "factoring_advance"
  | "factoring_batch"
  | "payment"
  | "bill_payment"
  | "transfer"
  | "work_order"
  | "bank_transaction"
  | "claim"
  | "lawsuit"
  | "matter"
  | "cash_advance"
  | "account"
  | "prepaid_asset"
  | "sales_tax_return"
  | "fixed_asset"
  | "insurance_policy"
  | "dvir"
  | "maintenance_inspection"
  | "warranty_claim"
  | "inventory_part"
  | "parts_inventory"
  | "maintenance_vendor"
  | "pm_schedule"
  | "safety_event"
  // SAF-F33: safety records were undrillable — no module could link INTO an accident, fine,
  // complaint, DOT inspection, escrow record, or permit. These resolve to the record's list surface
  // with a query param the page honors (same drill pattern as claim/lawsuit/settlement).
  | "accident"
  | "safety_fine"
  | "internal_fine"
  | "complaint"
  | "hos_violation"
  | "dot_inspection"
  | "escrow_record"
  | "permit"
  // SAF-B30: the three safety-incident record types. F33 called this the "incident" slot, but a single
  // kind cannot resolve — an incident lives on one of THREE lists and the id alone does not say which.
  // Naming them by type keeps EntityLink's contract intact: every declared kind resolves to a real route.
  | "damage_report"
  | "trailer_interchange"
  | "cargo_claim"
  // USERS column-wave: no EntityKind existed for identity.users, so every "created by / updated
  // by / voided by / approved by" field across the app rendered as plain text — no drill-through
  // to the acting user's own profile at all. Route verified present in routes/manifest.tsx:
  // <Route path="/users/:id">.
  | "user"
  // LINK reverse_link: GeofenceBreachesTab (safety) displayed a geofence's label as dead text with
  // no way to reach the geofence record itself. GeofencesPage (operations, route verified present
  // in routes/manifest.tsx: <Route path="/dispatch/geofencing">) is the only geofence detail
  // surface; it has no per-id sub-route, so this resolves with a query param the page now honors —
  // same drill pattern as claim/lawsuit/settlement.
  | "geofence"
  | "document"
  // LINK reverse_link: ReserveDashboard/ReserveTracker rendered a reserve balance's factor as dead
  // text — no module could link INTO a factor record. FactorAdmin (route verified present in
  // routes/manifest.tsx: <Route path="/factoring/factors">) is the only factor detail surface; it
  // has no per-id sub-route, so this resolves with a query param the page now honors.
  | "factor";

export interface EntityLinkProps {
  kind: EntityKind;
  id: string | null | undefined;
  /** Display text/content. Defaults to the raw id when omitted. */
  label?: ReactNode;
  className?: string;
  /**
   * Optional click handler — passed through to the underlying <Link>. Used by parent rows that
   * also have their own onClick (e.g. a table row that opens a drawer): call
   * `event.stopPropagation()` here so the cell's drill-through link doesn't also fire the row
   * handler. No-op when the kind has no resolvable route (plain-text fallback).
   */
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  /** Optional test hook, forwarded to the rendered <Link>/<span> as `data-testid`. */
  "data-testid"?: string;
}

const DEFAULT_LINK_CLASSNAME =
  "text-slate-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 rounded-sm";

/**
 * Resolves an entity kind + id to its real per-id detail route.
 *
 * Verified against apps/frontend/src/routes/manifest.tsx. Every declared EntityKind resolves —
 * never fabricate a dead link. Query-param drill-through kinds (settlement / liability /
 * claim / lawsuit / bank_transaction / cash_advance) require the target page to honor the param
 * (CI: verify-entitylink-deep-links, verify-legal-matter-lawsuit-linkage).
 * "payment" → /accounting/payments/:id · "bill_payment" → /accounting/bill-payments/:id
 * "transfer" → /banking/transfers?transfer_id= (TransfersListPage highlights row)
 * "work_order" → /maintenance/work-orders/:id
 * "bill" → /accounting/bills/:id · "expense" → /accounting/expenses/:id · "matter" → /legal/matters/:id
 * "lawsuit" → /safety/insurance/lawsuits?lawsuit_id= (LawsuitsTab selects+highlights the row)
 * "bank_transaction" → /banking/transactions?txn_id= (BankingHome expands row)
 */
export function resolveEntityRoute(kind: EntityKind, id: string): string | null {
  switch (kind) {
    case "load":
      return `/dispatch/loads/${id}`;
    case "bill":
      return `/accounting/bills/${id}`;
    case "invoice":
      return `/accounting/invoices/${id}`;
    case "journal_entry":
      return `/accounting/journal-entries/${id}`;
    case "vendor":
      return `/vendors/${id}`;
    case "customer":
      return `/customers/${id}`;
    case "unit":
      return `/fleet/units/${id}`;
    case "driver":
      return `/drivers/${id}`;
    case "trailer":
      return `/fleet/trailers/${id}`;
    case "bank_account":
      return `/banking/accounts/${id}`;
    case "factoring_advance":
      return `/accounting/factoring/${id}`;
    case "factoring_batch":
      // LINK-F5178 (2026-08-14): a real batch id (factoring.batch.id — the row shown by FactorAdmin's
      // "Batch History" table) drills to /factoring/batches/:id (BatchDetail.tsx's getBatchDetail),
      // NOT /accounting/factoring/:id (accounting.factoring_advances.id — a different table/entity).
      // The batch table previously used kind="factoring_advance" for these rows, which pointed every
      // batch link at the wrong detail page.
      return `/factoring/batches/${id}`;
    case "payment":
      return `/accounting/payments/${id}`;
    case "bill_payment":
      return `/accounting/bill-payments/${id}`;
    case "transfer":
      return `/banking/transfers?transfer_id=${id}`;
    case "work_order":
      return `/maintenance/work-orders/${id}`;
    case "inventory_part":
      return `/inventory?part_id=${id}`;
    case "parts_inventory":
      return `/maintenance/parts-inventory?part_inventory_id=${id}`;
    case "maintenance_vendor":
      return `/maintenance/vendors/${id}`;
    case "pm_schedule":
      return `/maintenance/pm-schedule?schedule_id=${id}`;
    case "settlement":
      return `/driver-finance/settlements?settlement_id=${id}`;
    case "liability":
      return `/liabilities?liability_id=${id}`;
    case "cash_advance":
      return `/cash-advances?advance_id=${id}`;
    case "expense":
      return `/accounting/expenses/${id}`;
    case "bank_transaction":
      return `/banking/transactions?txn_id=${id}`;
    case "claim":
      return `/safety/insurance/claims?claim_id=${id}`;
    case "lawsuit":
      return `/safety/insurance/lawsuits?lawsuit_id=${id}`;
    case "matter":
      return `/legal/matters/${id}`;
    case "account":
      // GL account (catalogs.accounts) → its register. Route verified present in
      // routes/manifest.tsx: <Route path="/accounting/chart-of-accounts/register/:accountId">.
      // Law §9 requires every money row to drill forward to the GL account it posts to.
      return `/accounting/chart-of-accounts/register/${id}`;
    case "prepaid_asset":
      return `/accounting/prepaid-expenses?asset_id=${id}`;
    case "sales_tax_return":
      return `/accounting/sales-tax?return_id=${id}`;
    case "fixed_asset":
      return `/accounting/fixed-assets?asset_id=${id}`;
    case "insurance_policy":
      return `/safety/insurance/policies/${id}`;
    case "dvir":
      return `/safety/idvr/${id}`;
    case "maintenance_inspection":
      return `/maintenance/inspections?inspection_id=${id}`;
    case "warranty_claim":
      return `/maintenance/warranty-claims?claim_id=${id}`;
    case "safety_event":
      return `/safety/safety-events?event_id=${id}`;
    // SAF-F33 safety drill-through — each target list page reads the param and opens/highlights the row.
    case "accident":
      return `/safety/accidents?accident_id=${id}`;
    case "safety_fine":
      return `/safety/external-fines?fine_id=${id}`;
    // LIABILITY column-wave: internal fines convert to a driver liability the same way civil
    // (external) fines do (safety-v5.routes.ts sets driver_liabilities.origin='internal_fine'),
    // but no EntityKind existed to drill from the liability back to the fine that caused it.
    case "internal_fine":
      return `/safety/internal-fines?fine_id=${id}`;
    case "complaint":
      return `/safety/complaints?complaint_id=${id}`;
    case "hos_violation":
      return `/safety/hos-violations?violation_id=${id}`;
    case "dot_inspection":
      return `/safety/dot-inspections?inspection_id=${id}`;
    case "escrow_record":
      return `/safety/escrow-record?driver_id=${id}`;
    case "permit":
      return `/safety/permits?permit_id=${id}`;
    case "damage_report":
      return `/safety/damage-reports?incident_id=${id}`;
    case "trailer_interchange":
      return `/safety/trailer-interchanges?incident_id=${id}`;
    case "cargo_claim":
      return `/safety/cargo-claims?incident_id=${id}`;
    case "user":
      return `/users/${id}`;
    case "geofence":
      return `/dispatch/geofencing?geofence_id=${id}`;
    case "document":
      return `/docs?file_id=${id}`;
    case "factor":
      return `/factoring/factors?factor_id=${id}`;
    default:
      return null;
  }
}

/**
 * Renders `id` as a clickable drill-through link when a real detail route exists for `kind`;
 * otherwise renders plain text (no dead link, no fabricated route).
 */
export function EntityLink({ kind, id, label, className, onClick, "data-testid": testId }: EntityLinkProps) {
  const display = label ?? id ?? "—";

  if (!id) {
    return (
      <span className={className} data-testid={testId}>
        {display}
      </span>
    );
  }

  const route = resolveEntityRoute(kind, id);
  if (!route) {
    return (
      <span className={className} data-testid={testId}>
        {display}
      </span>
    );
  }

  return (
    <Link
      to={route}
      className={className ?? DEFAULT_LINK_CLASSNAME}
      data-testid={testId}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
    >
      {display}
    </Link>
  );
}
