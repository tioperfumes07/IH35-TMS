import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { userFacingApiError } from "../../lib/api-error-message";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";

export type AuthGatePanelProps = {
  operatingCompanyId: string;
  action: "book_load" | "assign_driver" | "quick_assign";
  loadUuid?: string;
  unitUuid?: string;
  driverUuid?: string;
  trailerUuid?: string;
  loadLabel?: string | null;
  unitLabel?: string | null;
  driverLabel?: string | null;
  trailerLabel?: string | null;
  onBlockersChange?: (hasBlockers: boolean) => void;
};

export function AuthGatePanel(props: AuthGatePanelProps) {
  const q = useQuery({
    queryKey: [
      "auth-gates",
      props.operatingCompanyId,
      props.action,
      props.loadUuid ?? "",
      props.unitUuid ?? "",
      props.driverUuid ?? "",
      props.trailerUuid ?? "",
    ],
    enabled: Boolean(props.operatingCompanyId),
    queryFn: async () => {
      const params = new URLSearchParams({
        action: props.action,
        operating_company_id: props.operatingCompanyId,
      });
      if (props.loadUuid) params.set("load_uuid", props.loadUuid);
      if (props.unitUuid) params.set("unit_uuid", props.unitUuid);
      if (props.driverUuid) params.set("driver_uuid", props.driverUuid);
      if (props.trailerUuid) params.set("trailer_uuid", props.trailerUuid);
      return apiRequest<{ pass: boolean; blockers: Array<{ message: string; workflow: string }>; warnings: Array<{ message: string; workflow: string }>; info: Array<{ message: string }> }>(
        `/api/dispatch/auth-gates/check?${params.toString()}`
      );
    },
  });
  const blockers = q.data?.blockers ?? [];
  const warnings = q.data?.warnings ?? [];
  const info = q.data?.info ?? [];
  const onBlockersChange = props.onBlockersChange;
  useEffect(() => {
    onBlockersChange?.(q.isError || blockers.length > 0);
  }, [blockers.length, onBlockersChange, q.isError]);
  // WIZ-29 (owner 2026-09-04): a gate panel with nothing to report must render NOTHING — not an empty
  // bordered box under the pre-dispatch checks panel. Once the gate query resolved as `pass: true`
  // with no blockers/warnings/info (and not loading/errored), the container rendered with no children:
  // the "dead empty box" the owner saw. The affirmative "ready to book" state is already carried by
  // the checks panel above, so there is nothing for this panel to add. This return supersedes the old
  // pre-first-load `!q.data` guard (that state has no gate output either, so it still returns null).
  const hasGateOutput =
    q.isLoading || q.isError || blockers.length > 0 || warnings.length > 0 || info.length > 0;
  if (!hasGateOutput) return null;
  const hasIdentity = Boolean(props.loadUuid || props.unitUuid || props.driverUuid || props.trailerUuid);
  return (
    <div className="space-y-2 rounded-sm border border-gray-200 p-3" data-testid="auth-gate-panel">
      {/* Exact Leaves dispatch.panel.auth_gate:driver|unit|trailer|load —
          gates used UUIDs as query params only; expose real EntityLinks for bound identities. */}
      {hasIdentity ? (
        <div
          className="flex flex-wrap gap-x-3 gap-y-1 bg-white px-2 py-1.5 text-[11px] text-slate-700"
          data-testid="auth-gate-panel-entitylinks"
        >
          {props.loadUuid ? (
            <span>
              Load:{" "}
              <EntityLinkOrTombstone kind="load" id={props.loadUuid} name={props.loadLabel} noun="Load" />
            </span>
          ) : null}
          {props.driverUuid ? (
            <span>
              Driver:{" "}
              <EntityLinkOrTombstone kind="driver" id={props.driverUuid} name={props.driverLabel} noun="Driver" />
            </span>
          ) : null}
          {props.unitUuid ? (
            <span>
              Unit: <EntityLinkOrTombstone kind="unit" id={props.unitUuid} name={props.unitLabel} noun="Unit" />
            </span>
          ) : null}
          {props.trailerUuid ? (
            <span>
              Trailer:{" "}
              <EntityLinkOrTombstone kind="trailer" id={props.trailerUuid} name={props.trailerLabel} noun="Trailer" />
            </span>
          ) : null}
        </div>
      ) : null}
      {q.isError ? (
        <div className="bg-red-50 px-2 py-1.5 text-xs text-red-800" role="alert">
          <p>{userFacingApiError(q.error, "Could not verify dispatch authorization")}</p>
          <button
            type="button"
            className="mt-2 rounded-sm border border-red-300 bg-white px-2 py-1 text-xs font-semibold"
            onClick={() => void q.refetch()}
          >
            Retry authorization check
          </button>
        </div>
      ) : null}
      {blockers.map((b, i) => (
        <div key={`b-${i}`} className="rounded-sm bg-red-50 px-2 py-1 text-xs text-red-800">{b.workflow}: {b.message}</div>
      ))}
      {warnings.map((w, i) => (
        <div key={`w-${i}`} className="rounded-sm bg-slate-100 px-2 py-1 text-xs text-slate-700">{w.workflow}: {w.message}</div>
      ))}
      {info.map((inf, i) => (
        <div key={`i-${i}`} className="rounded-sm bg-slate-100 px-2 py-1 text-xs text-slate-700">{inf.message}</div>
      ))}
      {q.isLoading ? <p className="text-xs text-gray-500">Checking dispatch authorization gates…</p> : null}
    </div>
  );
}
