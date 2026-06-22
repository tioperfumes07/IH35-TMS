import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";

export type AuthGatePanelProps = {
  operatingCompanyId: string;
  action: "book_load" | "assign_driver" | "quick_assign";
  loadUuid?: string;
  unitUuid?: string;
  driverUuid?: string;
  trailerUuid?: string;
  onBlockersChange?: (hasBlockers: boolean) => void;
};

export function AuthGatePanel(props: AuthGatePanelProps) {
  const q = useQuery({
    queryKey: ["auth-gates", props],
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
  props.onBlockersChange?.(blockers.length > 0);
  if (!q.data && !q.isLoading) return null;
  return (
    <div className="space-y-2 rounded border border-gray-200 p-3" data-testid="auth-gate-panel">
      {blockers.map((b, i) => (
        <div key={`b-${i}`} className="rounded bg-red-50 px-2 py-1 text-sm text-red-800">{b.workflow}: {b.message}</div>
      ))}
      {warnings.map((w, i) => (
        <div key={`w-${i}`} className="rounded bg-amber-50 px-2 py-1 text-sm text-amber-900">{w.workflow}: {w.message}</div>
      ))}
      {info.map((inf, i) => (
        <div key={`i-${i}`} className="rounded bg-slate-100 px-2 py-1 text-sm text-slate-700">{inf.message}</div>
      ))}
      {q.isLoading ? <p className="text-xs text-gray-500">Checking dispatch authorization gates…</p> : null}
    </div>
  );
}
