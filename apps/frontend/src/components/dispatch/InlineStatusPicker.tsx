import { useEffect, useRef, useState } from "react";
import type { LoadStatus } from "../../api/loads";
import { STATUS_LABEL } from "./constants";

// INLINE-STATUS-CHANGER (owner 2026-09-09, verbatim): "in all views in loadboard, there must be like
// in quickbooks, a button to change status, with arrow drop down and select status in that button —
// dispatched, delivered waiting docs, or the new one we added where we send the bol and invoice to the
// factoring company while we are still delivering ... but it creates the invoices etc but stays in the
// load board until we change the status or the driver changes the status."
//
// The dispatcher-facing set below is the QuickBooks-style short list the owner named. The backend
// money-aware transition endpoint (api/loads.ts updateLoadStatus → dispatch transition / mdata
// lifecycle) is the single writer and validates whether a specific transition is legal from the load's
// current status; an illegal pick surfaces its server error as a toast rather than being pre-hidden, so
// the operator always sees why. `invoiced` is the "invoice created / sent to factoring while still
// delivering" case — selecting it creates the invoice but the load stays on the board.
export const DISPATCHER_STATUS_OPTIONS: LoadStatus[] = [
  "dispatched",
  "in_transit",
  "delivered_pending_docs",
  "invoiced",
  "completed_docs_received",
];

function statusPillClass(status: LoadStatus): string {
  if (
    status === "cancelled" ||
    status === "abandoned" ||
    status === "driver_walkoff" ||
    status === "driver_no_show"
  ) {
    return "bg-red-100 text-red-700";
  }
  return "bg-slate-100 text-slate-700";
}

type Props = {
  loadId: string;
  status: LoadStatus;
  disabled?: boolean;
  pending?: boolean;
  onSelect: (next: LoadStatus) => void;
};

export function InlineStatusPicker({ loadId, status, disabled, pending, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // TRAPPING-PICKER LAW (J1): this menu MUST dismiss on outside click / Escape — never add another
  // picker that only closes on re-select.
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const options = DISPATCHER_STATUS_OPTIONS.filter((option) => option !== status);

  return (
    <div ref={rootRef} className="relative inline-block" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        disabled={disabled || pending}
        data-testid={`inline-status-picker-${loadId}`}
        className={`inline-flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-semibold ${statusPillClass(status)} ${
          disabled || pending ? "cursor-default opacity-70" : "cursor-pointer hover:brightness-95"
        }`}
        onClick={(event) => {
          event.stopPropagation();
          if (!disabled && !pending) setOpen((value) => !value);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Change load status"
      >
        <span>{STATUS_LABEL[status]}</span>
        <span aria-hidden className="text-xs leading-none">{pending ? "…" : "▾"}</span>
      </button>
      {open ? (
        <div
          role="listbox"
          data-testid={`inline-status-menu-${loadId}`}
          className="absolute left-0 z-30 mt-1 min-w-[180px] rounded-sm border border-gray-200 bg-white py-1 shadow-lg"
        >
          {options.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={false}
              data-testid={`inline-status-option-${loadId}-${option}`}
              className="block w-full px-3 py-1 text-left text-xs text-gray-800 hover:bg-slate-100"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                onSelect(option);
              }}
            >
              {STATUS_LABEL[option]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
