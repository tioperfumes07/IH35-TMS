import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { resolveApiUrl } from "../../api/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ListErrorState } from "../../components/ListErrorState";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { userFacingApiError } from "../../lib/api-error-message";
import { useToast } from "../../components/Toast";

interface LayoverRow {
  uuid: string;
  driver_uuid: string;
  previous_load_uuid: string;
  previous_load_number: string;
  next_load_uuid: string | null;
  next_load_number: string | null;
  layover_started_at: string;
  layover_ended_at: string | null;
  duration_hours: number | null;
  billable_to_customer: boolean;
  per_diem_eligible: boolean;
}

interface Props {
  driverUuid: string;
  operatingCompanyId: string;
}

export function DriverLayoverHistory({ driverUuid, operatingCompanyId }: Props) {
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const qc = useQueryClient();
  const { pushToast } = useToast();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<{ data: LayoverRow[] }>({
    queryKey: ["driver-layovers", driverUuid, from, to],
    queryFn: async () => {
      const res = await fetch(resolveApiUrl(`/api/v1/dispatch/layovers?operating_company_id=${encodeURIComponent(operatingCompanyId)}&driver=${encodeURIComponent(driverUuid)}&from=${from}&to=${to}`),
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load layovers");
      return res.json();
    },
    enabled: !!driverUuid && !!operatingCompanyId,
  });

  const billableMutation = useMutation({
    mutationFn: async ({ uuid, billable }: { uuid: string; billable: boolean }) => {
      const res = await fetch(resolveApiUrl(`/api/v1/dispatch/layovers/${uuid}/mark-billable`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ billable, operating_company_id: operatingCompanyId }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["driver-layovers"] }),
    // DRV-F6330: no onError, no toast import anywhere in the file (userFacingApiError was only
    // wired to the read query's error state, never to this write). A rejected billable-toggle
    // silently did nothing — the button just stayed on whatever it showed before the click.
    onError: (err) => pushToast(userFacingApiError(err, "Could not update billable status"), "error"),
  });

  const rows = data?.data ?? [];
  const columns = useMemo<ParityColumn<LayoverRow>[]>(
    () => [
      // C5 (L5) — a layover is BY DEFINITION the gap between two loads, and the endpoint has
      // returned both ids all along (previous_load_uuid / next_load_uuid). Neither was ever
      // rendered, so the surface that exists to explain "why was this driver idle" could not
      // reach either load. Additive columns, canonical drill-through.
      {
        key: "previous_load_uuid",
        label: "Previous load",
        sortable: true,
        render: (row) => <EntityLink kind="load" id={row.previous_load_uuid} label={entityLabel(row.previous_load_number, row.previous_load_uuid, "Load")} />,
      },
      {
        key: "next_load_uuid",
        label: "Next load",
        sortable: true,
        render: (row) => <EntityLink kind="load" id={row.next_load_uuid} label={row.next_load_uuid ? entityLabel(row.next_load_number, row.next_load_uuid, "Load") : "—"} />,
      },
      {
        key: "layover_started_at",
        label: "Started",
        sortable: true,
        render: (row) => new Date(row.layover_started_at).toLocaleString(),
      },
      {
        key: "layover_ended_at",
        label: "Ended",
        sortable: true,
        render: (row) => (row.layover_ended_at ? new Date(row.layover_ended_at).toLocaleString() : "ongoing"),
      },
      {
        key: "duration_hours",
        label: "Hours",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (row) => (row.duration_hours != null ? row.duration_hours.toFixed(1) : "—"),
      },
      {
        key: "billable_to_customer",
        label: "Billable",
        sortable: true,
        render: (row) => (
          <button
            type="button"
            onClick={() => billableMutation.mutate({ uuid: row.uuid, billable: !row.billable_to_customer })}
            className={`text-xs px-2 py-0.5 rounded-sm ${row.billable_to_customer ? "bg-slate-100 text-slate-700" : "bg-gray-100 text-gray-600"}`}
          >
            {row.billable_to_customer ? "Billable" : "Not billable"}
          </button>
        ),
      },
      {
        key: "per_diem_eligible",
        label: "Per Diem",
        sortable: true,
        render: (row) => (
          <span className={`text-xs ${row.per_diem_eligible ? "text-slate-700" : "text-gray-400"}`}>
            {row.per_diem_eligible ? "Eligible" : "Excluded"}
          </span>
        ),
      },
    ],
    [billableMutation],
  );

  return (
    <div>
      <div className="flex gap-3 mb-4">
        <DatePicker value={from} onChange={(next) => setFrom(next)}
          className="" />
        <span className="self-center text-gray-400">—</span>
        <DatePicker value={to} onChange={(next) => setTo(next)}
          className="" />
      </div>
      {isError && (
        <ListErrorState
          title="Couldn't load driver layovers"
          status={0}
          message={userFacingApiError(error, "Request failed")}
          onRetry={() => void refetch()}
        />
      )}
      {!isError && (
        <ParityTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.uuid}
          loading={isLoading || (isFetching && rows.length === 0)}
          storageKey="driver-layover-history"
          emptyText="No layovers detected in this period."
        />
      )}
    </div>
  );
}

export default DriverLayoverHistory;
