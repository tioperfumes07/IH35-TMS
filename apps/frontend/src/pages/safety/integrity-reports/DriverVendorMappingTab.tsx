import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { resolveApiUrl } from "../../../api/client";
import { useCompanyContext } from "../../../contexts/CompanyContext";

async function fetchSnapshot() {
  const res = await fetch(resolveApiUrl("/api/integrations/integrity/driver-vendor-mapping"), { credentials: "include" });
  if (!res.ok) throw new Error("fetch_failed");
  return res.json();
}

async function triggerScan(operatingCompanyId: string) {
  const res = await fetch(resolveApiUrl("/api/integrations/integrity/driver-vendor-mapping/scan"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operating_company_id: operatingCompanyId }),
  });
  if (!res.ok) throw new Error("scan_failed");
  return res.json();
}

export function DriverVendorMappingTab() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["integrity", "driver-vendor-mapping"],
    queryFn: fetchSnapshot,
    enabled: Boolean(companyId),
  });

  const scanMutation = useMutation({
    mutationFn: () => triggerScan(companyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["integrity", "driver-vendor-mapping"] }),
  });

  const findings = query.data?.snapshot?.findings ?? [];

  return (
    <div className="space-y-3" data-testid="driver-vendor-mapping-tab">
      <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        Driver↔QBO vendor mapping drift detector (CAP-15). Review critical findings before settlement creation.
      </div>
      <button
        type="button"
        className="rounded border px-3 py-1 text-xs font-semibold"
        disabled={!companyId || scanMutation.isPending}
        onClick={() => scanMutation.mutate()}
      >
        Run scan
      </button>
      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="bg-gray-50 text-[10px] uppercase">
            <th className="px-2 py-1 text-left">Driver</th>
            <th className="px-2 py-1 text-left">Severity</th>
            <th className="px-2 py-1 text-left">Drift reason</th>
            <th className="px-2 py-1 text-left">Action</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f: { driver_uuid: string; severity: string; drift_reason: string }, i: number) => (
            <tr key={`${f.driver_uuid}-${i}`} className="border-t">
              <td className="px-2 py-1">{f.driver_uuid}</td>
              <td className="px-2 py-1">{f.severity}</td>
              <td className="px-2 py-1">{f.drift_reason}</td>
              <td className="px-2 py-1">
                <button type="button" className="underline text-[#1f2a44]">Ack</button>
              </td>
            </tr>
          ))}
          {findings.length === 0 ? (
            <tr><td colSpan={4} className="px-2 py-3 text-center text-slate-500">No drift findings.</td></tr>
          ) : null}
        </tbody>
      </table>
      </div>
    </div>
  );
}
