import { Link } from "react-router-dom";

export type EntityKind =
  | "load"
  | "driver"
  | "customer"
  | "vendor"
  | "unit"
  | "trailer"
  | "bill"
  | "invoice"
  | "payment"
  | "journal_entry"
  | "work_order"
  | "settlement"
  | "factoring_batch"
  | "legal_matter"
  | "banking_account";

function entityPath(kind: EntityKind, id: string): string | null {
  switch (kind) {
    case "load":            return `/dispatch/loads/${id}`;
    case "driver":          return `/drivers/${id}`;
    case "customer":        return `/customers/${id}`;
    case "vendor":          return `/vendors/${id}`;
    case "unit":            return `/fleet/units/${id}`;
    case "trailer":         return `/fleet/trailers/${id}`;
    case "bill":            return `/accounting/bills/${id}`;
    case "invoice":         return `/accounting/invoices/${id}`;
    case "payment":         return `/accounting/payments/${id}`;
    case "journal_entry":   return `/accounting/journal-entries/${id}`;
    case "work_order":      return `/maintenance/work-orders/${id}`;
    case "settlement":      return `/drivers/settlements`;
    case "factoring_batch": return `/factoring/batches/${id}`;
    case "legal_matter":    return `/legal/matters/${id}`;
    case "banking_account": return `/banking/accounts/${id}`;
    default:                return null;
  }
}

type Props = {
  kind: EntityKind;
  id: string | null | undefined;
  label?: string | null;
  className?: string;
};

/**
 * Renders any entity id as a clickable link to its detail route.
 * Renders "—" when id is absent. Used in tables and detail panels to
 * replace plain-text id cells (enforced by verify-entity-link-no-bare-ids.mjs).
 */
export function EntityLink({ kind, id, label, className }: Props) {
  if (!id) return <span className="text-gray-400">—</span>;

  const path = entityPath(kind, id);
  if (!path) return <span>{label ?? id}</span>;

  return (
    <Link
      to={path}
      className={className ?? "text-slate-700 hover:underline"}
      onClick={(e) => e.stopPropagation()}
    >
      {label ?? id}
    </Link>
  );
}
