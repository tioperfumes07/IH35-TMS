import type { ReactNode } from "react";

interface Props {
  selectedCount: number;
  selectAllPages: boolean;
  totalRows: number;
  onSelectAcrossPages: () => void;
  onClearSelection: () => void;
  children?: ReactNode;
}

export function BatchActionsBar({
  selectedCount,
  selectAllPages,
  totalRows,
  onSelectAcrossPages,
  onClearSelection,
  children,
}: Props) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg text-sm">
      <span className="font-medium text-slate-700">
        {selectAllPages ? `All ${totalRows} rows selected` : `${selectedCount} selected`}
      </span>

      {!selectAllPages && selectedCount > 0 && (
        <button
          type="button"
          onClick={onSelectAcrossPages}
          className="text-xs text-slate-700 underline hover:text-slate-700"
        >
          Select all {totalRows} across pages
        </button>
      )}

      {selectAllPages && (
        <button
          type="button"
          onClick={onClearSelection}
          className="text-xs text-slate-700 underline hover:text-slate-700"
        >
          Clear selection
        </button>
      )}

      {!selectAllPages && (
        <button
          type="button"
          onClick={onClearSelection}
          className="text-xs text-gray-500 hover:text-gray-700 ml-auto"
        >
          ✕
        </button>
      )}

      {children && (
        <div className="flex items-center gap-2 ml-auto">{children}</div>
      )}
    </div>
  );
}
