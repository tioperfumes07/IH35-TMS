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
  | "payment"
  | "bill_payment"
  | "work_order"
  | "bank_transaction"
  | "claim"
  | "lawsuit"
  | "matter"
  | "cash_advance"
  | "account"
  | "prepaid_asset"
  | "fixed_asset";

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
 * "payment" → /accounting/payments/:id · "work_order" → /maintenance/work-orders/:id
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
    case "payment":
      return `/accounting/payments/${id}`;
    case "bill_payment":
      return `/accounting/bill-payments/${id}`;
    case "work_order":
      return `/maintenance/work-orders/${id}`;
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
    case "fixed_asset":
      return `/accounting/fixed-assets?asset_id=${id}`;
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
