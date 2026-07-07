import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { resolveApiUrl } from "../../../api/client";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";

type FindingRow = { driver_uuid: string; severity: string; drift_reason: string; _rowId: string };

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

  const findings: Array<{ driver_uuid: string; severity: string; drift_reason: string }> =
    query.data?.snapshot?.findings ?? [];

  const rows = useMemo<FindingRow[]>(
    () => findings.map((f, i) => ({ ...f, _rowId: `${f.driver_uuid}-${i}` })),
    [findings],
  );

  const columns = useMemo<ParityColumn<FindingRow>[]>(
    () => [
      { key: "driver_uuid", label: "Driver", sortable: true },
      { key: "severity", label: "Severity", sortable: true },
      { key: "drift_reason", label: "Drift reason" },
      {
        key: "action",
        label: "Action",
        render: () => (
          <button type="button" className="underline text-[#1f2a44]">
            Ack
          </button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-3" data-testid="driver-vendor-mapping-tab">
      <div className="rounded-sm border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        Driver↔QBO vendor mapping drift detector (CAP-15). Review critical findings before settlement creation.
      </div>
      <button
        type="button"
        className="rounded-sm border px-3 py-1 text-xs font-semibold"
        disabled={!companyId || scanMutation.isPending}
        onClick={() => scanMutation.mutate()}
      >
        Run scan
      </button>
      <ParityTable<FindingRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row._rowId}
        loading={query.isLoading}
        emptyText="No drift findings."
        storageKey="safety-driver-vendor-mapping"
        exportFilename="driver-vendor-mapping-findings"
        tableTestId="driver-vendor-mapping-tab-table"
      />
    </div>
  );
}
