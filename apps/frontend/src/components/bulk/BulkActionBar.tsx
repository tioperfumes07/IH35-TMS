import type { ReactNode } from "react";
import { useBulkPermission } from "../../hooks/useBulkPermission";

export type BulkActionItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  danger?: boolean;
  disabled?: boolean;
  /** Permission key checked against bulk role matrix when set. */
  action?: string;
  onClick: () => void;
};

export type BulkActionBarProps = {
  selectedCount: number;
  actions: BulkActionItem[];
  onClear: () => void;
  applying?: boolean;
  /** Optional slot for entity-specific controls (e.g. Fleet status/type dropdowns). */
  children?: ReactNode;
  selectedLabel?: string;
  /** When false, skip permission hook (Storybook/tests). Default true. */
  permissionGate?: boolean;
  /** Actions treated as Owner/Admin-only when item.action is set. */
  destructiveActions?: readonly string[];
};

export function BulkActionBar({
  selectedCount,
  actions,
  onClear,
  applying = false,
  children,
  selectedLabel,
  permissionGate = true,
  destructiveActions,
}: BulkActionBarProps) {
  const bulkPermission = useBulkPermission(destructiveActions);

  if (selectedCount <= 0) {
    return null;
  }

  if (permissionGate && !bulkPermission.canUseBulkOps) {
    return null;
  }

  const visibleActions = actions.filter((action) => {
    if (!permissionGate) return true;
    if (!action.action) return true;
    return bulkPermission.isActionAllowed(action.action, destructiveActions);
  });

  if (visibleActions.length === 0 && !children) {
    return null;
  }

  const countLabel = selectedLabel ?? `${selectedCount} selected`;

  return (
    <div
      className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded border border-slate-300 bg-slate-100 p-2 text-xs"
      role="toolbar"
      aria-label="Bulk actions"
    >
      <span className="font-semibold text-slate-700" title={countLabel}>
        {countLabel}
      </span>
      {children}
      {visibleActions.map((action) => {
        const isDanger = action.destructive ?? action.danger ?? false;
        return (
          <button
            key={action.id}
            type="button"
            className={
              isDanger
                ? "rounded border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-800 disabled:opacity-50"
                : "rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
            }
            disabled={applying || action.disabled}
            onClick={action.onClick}
          >
            {action.icon ? <span className="mr-1 inline-flex align-middle">{action.icon}</span> : null}
            {action.label}
          </button>
        );
      })}
      <button type="button" className="text-slate-700 underline" onClick={onClear} disabled={applying}>
        Clear selection
      </button>
    </div>
  );
}
