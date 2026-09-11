import { useEffect, useMemo, useRef, useState } from "react";
import type { LoadStatus } from "../../api/loads";
import { getOfficeTransitionButtons } from "@ih35/shared-types";
import { STATUS_LABEL } from "./constants";

// INLINE-STATUS-CHANGER (owner 2026-09-09, verbatim): "in all views in loadboard, there must be like
// in quickbooks, a button to change status, with arrow drop down and select status in that button —
// dispatched, delivered waiting docs, or the new one we added where we send the bol and invoice to the
// factoring company while we are still delivering ... but it creates the invoices etc but stays in the
// load board until we change the status or the driver changes the status."
//
// STATUS-DROPDOWN-CORRECTNESS (owner correction 2026-09-11, verbatim: "InlineStatusPicker.tsx ...
// has a HARDCODED array DISPATCHER_STATUS_OPTIONS with only 5 statuses. Replace it with the same
// getOfficeTransitionButtons(status) call that LoadStatusChanger.tsx already correctly uses — one
// state-machine-derived source for status options everywhere, not two components with different
// truths."). The old hardcoded 5-status list didn't vary by current status at all — filtering out
// only the CURRENT status meant a load sitting at e.g. "cancelled" was still offered "Dispatched" /
// "In transit" as if those were legal moves backward. getOfficeTransitionButtons(status) is the
// SAME shared state machine LoadStatusChanger (the load-detail header control) already uses, so the
// two controls can never again disagree about which transitions are legal from a given status.
//
// "invoiced" was in the old hardcoded list but is NOT part of the office transition state machine
// (ALLOWED_TRANSITIONS) at all — LoadStatusChanger treats it as a separate action
// (loadCanMarkInvoiced + its own onMarkInvoiced callback, a distinct write path from a bare status
// flip, since marking invoiced has its own side effects). InlineStatusPicker has no equivalent
// separate callback (row/card-level surfaces only ever passed one onSelect), so it correctly no
// longer offers "invoiced" as a plain transition — offering it as a bare status write here would
// have skipped whatever LoadStatusChanger's dedicated mark-invoiced path actually performs.
// The backend money-aware transition endpoint (api/loads.ts updateLoadStatus → dispatch transition /
// mdata lifecycle) remains the single writer and still validates server-side.
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

  const transitions = useMemo(() => getOfficeTransitionButtons(String(status ?? "").trim()), [status]);
  const interactive = !disabled && !pending && transitions.length > 0;

  return (
    <div ref={rootRef} className="relative inline-block" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        disabled={!interactive}
        data-testid={`inline-status-picker-${loadId}`}
        className={`inline-flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-semibold ${statusPillClass(status)} ${
          interactive ? "cursor-pointer hover:brightness-95" : "cursor-default opacity-70"
        }`}
        onClick={(event) => {
          event.stopPropagation();
          if (interactive) setOpen((value) => !value);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={interactive ? "Change load status" : "Status"}
      >
        <span>{STATUS_LABEL[status]}</span>
        {interactive ? <span aria-hidden className="text-xs leading-none">{pending ? "…" : "▾"}</span> : null}
      </button>
      {open ? (
        <div
          role="listbox"
          data-testid={`inline-status-menu-${loadId}`}
          className="absolute left-0 z-30 mt-1 min-w-[180px] rounded-sm border border-gray-200 bg-white py-1 shadow-lg"
        >
          {transitions.map((t) => (
            <button
              key={t.target}
              type="button"
              role="option"
              aria-selected={false}
              data-testid={`inline-status-option-${loadId}-${t.target}`}
              className="block w-full px-3 py-1 text-left text-xs text-gray-800 hover:bg-slate-100"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                onSelect(t.target as LoadStatus);
              }}
            >
              {STATUS_LABEL[t.target as LoadStatus] ?? t.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
