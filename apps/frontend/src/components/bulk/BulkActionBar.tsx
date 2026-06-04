import type { ReactNode } from "react";

export type BulkActionItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  danger?: boolean;
  disabled?: boolean;
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
};

export function BulkActionBar({
  selectedCount,
  actions,
  onClear,
  applying = false,
  children,
  selectedLabel,
}: BulkActionBarProps) {
  if (selectedCount <= 0) {
    return null;
  }

  const countLabel = selectedLabel ?? `${selectedCount} selected`;

  return (
    <div
      className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded border border-blue-200 bg-blue-50 p-2 text-xs"
      role="toolbar"
      aria-label="Bulk actions"
    >
      <span className="font-semibold text-blue-900" title={countLabel}>
        {countLabel}
      </span>
      {children}
      {actions.map((action) => {
        const isDanger = action.destructive ?? action.danger ?? false;
        return (
          <button
            key={action.id}
            type="button"
            className={
              isDanger
                ? "rounded border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-800 disabled:opacity-50"
                : "rounded border border-blue-300 bg-white px-2 py-1 text-xs font-semibold text-blue-800 disabled:opacity-50"
            }
            disabled={applying || action.disabled}
            onClick={action.onClick}
          >
            {action.icon ? <span className="mr-1 inline-flex align-middle">{action.icon}</span> : null}
            {action.label}
          </button>
        );
      })}
      <button type="button" className="text-blue-700 underline" onClick={onClear} disabled={applying}>
        Clear selection
      </button>
    </div>
  );
}
