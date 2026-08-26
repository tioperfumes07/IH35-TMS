import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { resolveApiUrl } from "../../../api/client";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { useToast } from "../../../components/Toast";
import { userFacingApiError } from "../../../lib/api-error-message";

type FindingRow = { driver_uuid: string; severity: string; drift_reason: string; _rowId: string };

async function fetchSnapshot(operatingCompanyId: string) {
  const query = new URLSearchParams({ operating_company_id: operatingCompanyId });
  const res = await fetch(resolveApiUrl(`/api/integrations/integrity/driver-vendor-mapping?${query.toString()}`), { credentials: "include" });
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
  const { pushToast } = useToast();
  const actionGenerationRef = useRef(0);
  const [scanError, setScanError] = useState<unknown>(null);

  const query = useQuery({
    queryKey: ["integrity", "driver-vendor-mapping", companyId],
    queryFn: () => fetchSnapshot(companyId),
    enabled: Boolean(companyId),
  });

  /** @matrix-built modules=safety cols=driver,vendor,connectivity,reverse_link */
  const scanMutation = useMutation({
    mutationFn: (input: { companyId: string; generation: number }) => triggerScan(input.companyId),
    onMutate: () => setScanError(null),
    onSuccess: async (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      await queryClient.invalidateQueries({ queryKey: ["integrity", "driver-vendor-mapping", input.companyId] });
    },
    onError: (error, input) => {
      if (input.generation === actionGenerationRef.current) setScanError(error);
    },
  });

  useEffect(() => {
    actionGenerationRef.current += 1;
    setScanError(null);
    scanMutation.reset();
  }, [companyId]); // Mutation reset is stable; company transitions own a fresh integrity scan lifecycle.

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
        // C-13: this button had NO onClick at all — a pure dead click. There is no ack endpoint
        // (registerDriverVendorMappingIntegrityRoutes exposes only GET snapshot + POST scan), so
        // wiring a real handler here would mean inventing backend persistence for this column.
        // Same honest-disabled pattern as SafetyEventsTable's "Bulk archive" — disabled + tooltip
        // + info toast, never a silent no-op.
        render: () => (
          <button
            type="button"
            className="underline text-[#1f2a44] disabled:opacity-50 disabled:no-underline"
            disabled
            title="Acknowledging findings is not available yet — no backend endpoint. Re-run the scan once the mapping is fixed."
            onClick={() =>
              pushToast(
                "Acknowledging findings is not available yet — no backend endpoint. Re-run the scan once the mapping is fixed.",
                "info"
              )
            }
          >
            Ack
          </button>
        ),
      },
    ],
    [pushToast],
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
        onClick={() => scanMutation.mutate({ companyId, generation: actionGenerationRef.current })}
      >
        Run scan
      </button>
      {scanError ? (
        <p className="text-xs text-red-700" data-testid="driver-vendor-scan-error">
          {userFacingApiError(scanError, "Could not run the driver-vendor mapping scan.")}
        </p>
      ) : null}
      {/* CLS-LIST-ERROR-STATE-UNGUARDED: a failed query fell through to emptyText "No drift findings." — an outage presenting as a
          clean driver-to-vendor mapping, which is exactly the integrity claim this tab exists to test. */}
      {query.isError ? (
        <ListErrorState
          title="Couldn't load driver-vendor mapping drift"
          status={0}
          message={(query.error as Error)?.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
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
      )}
    </div>
  );
}
