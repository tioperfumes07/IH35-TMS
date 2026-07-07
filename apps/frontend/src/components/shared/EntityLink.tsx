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
  | "bank_account"
  | "factoring_advance";

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
 * Verified against apps/frontend/src/routes/manifest.tsx (2026-07-06 sweep). Kinds that do
 * NOT have a per-id detail route return null on purpose — EntityLink renders plain text for
 * those rather than fabricating a dead link:
 *   - "bill": no /accounting/bills/:id route exists; only the list (/accounting/bills) and
 *     an inline selection-state BillDetailPanel. AccountRegisterPage.sourceRoute() and
 *     IntegrationTransactionsPage/AuditTrailPage's sourceLink() incorrectly link to a
 *     fabricated /accounting/bills/:id today — do not copy that.
 *   - "expense": /accounting/expenses is ExpenseCreatePage (a create form) and
 *     /accounting/expenses/list is the list; no :id detail route exists.
 * "settlement" has no path-param route either, but SettlementsPage does support a real
 * query-param drill-through (?settlement_id=), so it resolves to that instead of null.
 */
export function resolveEntityRoute(kind: EntityKind, id: string): string | null {
  switch (kind) {
    case "load":
      return `/dispatch/loads/${id}`;
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
    case "settlement":
      return `/driver-finance/settlements?settlement_id=${id}`;
    case "bill":
    case "expense":
      return null;
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
    <Link to={route} className={className ?? DEFAULT_LINK_CLASSNAME} onClick={onClick} data-testid={testId}>
      {display}
    </Link>
  );
}
