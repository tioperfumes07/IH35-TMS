import { ApiError } from "../api/client";

const BARE_E_CODE = /^E_[A-Z0-9_]+$/;

/** Turn `E_DRIVER_REPAIR_BLOCK` into a short operator sentence (never toast the raw code alone). */
export function humanizeErrorCode(code: string): string {
  const trimmed = code.trim();
  if (!BARE_E_CODE.test(trimmed)) return trimmed;
  return trimmed.replace(/^E_/, "").replace(/_/g, " ").toLowerCase();
}

const DISPATCH_STATUS_LABELS: Record<string, string> = {
  unassigned: "draft (unassigned)",
  assigned_not_dispatched: "assigned",
  dispatched: "dispatched",
  driver_no_show: "driver no-show",
  driver_walkoff: "driver walk-off",
  in_transit: "in transit",
  delivered_pending_docs: "delivered (pending docs)",
  completed_docs_received: "completed",
  invoiced: "invoiced",
  paid: "paid",
  cancelled: "cancelled",
  abandoned: "abandoned",
};

function dispatchStatusLabel(status: string): string {
  return DISPATCH_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

/**
 * DISPATCH-3 (owner order 2026-09-05): the load transition route rejects an illegal status change
 * with {error:"invalid_transition", from_status, to_status} and NO human message, so a dispatcher
 * pressing Dispatch on a draft (unassigned) load only ever saw the machine code "invalid_transition"
 * — the button looked dead. Turn it into a plain-English reason with the corrective action. Draft is
 * the common case (13508): a draft can only become assigned once it has a driver.
 */
export function invalidTransitionMessage(from: string, to: string): string {
  if (from === "unassigned") {
    return "This load is still a draft — assign a driver and unit before dispatching.";
  }
  return `A ${dispatchStatusLabel(from)} load can't move straight to ${dispatchStatusLabel(to)}.`;
}

/**
 * CU-09 / CLS-BARE-ERROR — prefer `message` / `blocker` / details, never a bare `E_*` code.
 * Use for every operator toast / submitError from an API catch.
 */
export function userFacingApiError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const data = (err.data as Record<string, unknown> | null) ?? {};
    if (data.error === "invalid_transition") {
      const from = typeof data.from_status === "string" ? data.from_status : "";
      const to = typeof data.to_status === "string" ? data.to_status : "";
      return invalidTransitionMessage(from, to);
    }
    const details = data.details as Record<string, unknown> | undefined;
    if (details) {
      if (typeof details.message === "string" && details.message.trim()) return details.message.trim();
      const fieldErrors = details.fieldErrors as Record<string, string[]> | undefined;
      const firstField = fieldErrors ? Object.values(fieldErrors).flat()[0] : undefined;
      if (firstField) return firstField;
    }
    for (const key of ["message", "blocker", "error_description", "detail"] as const) {
      const v = data[key];
      if (typeof v === "string" && v.trim()) {
        const text = v.trim();
        if (BARE_E_CODE.test(text)) return `${fallback}: ${humanizeErrorCode(text)}`;
        return text;
      }
    }
    if (typeof data.error === "string" && data.error.trim()) {
      const code = data.error.trim();
      if (BARE_E_CODE.test(code)) return `${fallback}: ${humanizeErrorCode(code)}`;
      return `${fallback}: ${code}`;
    }
    if (err.message && !BARE_E_CODE.test(err.message.trim())) return err.message;
    if (err.message && BARE_E_CODE.test(err.message.trim())) {
      return `${fallback}: ${humanizeErrorCode(err.message)}`;
    }
    return `${fallback} (HTTP ${err.status}).`;
  }
  if (err instanceof Error && err.message.trim()) {
    const text = err.message.trim();
    if (BARE_E_CODE.test(text)) return `${fallback}: ${humanizeErrorCode(text)}`;
    return text;
  }
  return fallback;
}
