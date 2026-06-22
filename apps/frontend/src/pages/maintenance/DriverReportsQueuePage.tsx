import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listDriverReports, updateDriverReportStatus, type DriverReportRow } from "../../api/maintenance";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

const LINK = "text-slate-700 hover:underline";

export function DriverReportsQueuePage() {
  const { selectedCompanyId, companies } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? companies[0]?.id ?? "";
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"" | DriverReportRow["status"]>("");
  const [search, setSearch] = useState("");
  const [resolutionDraft, setResolutionDraft] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: ["maintenance", "driver-reports", operatingCompanyId, statusFilter],
    queryFn: () =>
      listDriverReports({
        operating_company_id: operatingCompanyId,
        status: statusFilter || undefined,
      }),
    enabled: Boolean(operatingCompanyId),
  });

  const allRows = useMemo(() => q.data?.rows ?? [], [q.data?.rows]);
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return allRows;
    return allRows.filter((r) =>
      [r.report_type, r.driver_name, r.driver_id, r.load_number, r.description, r.status].some((v) =>
        String(v ?? "").toLowerCase().includes(s),
      ),
    );
  }, [allRows, search]);

  const mut = useMutation({
    mutationFn: (args: { id: string; status: "under_review" | "resolved" | "dismissed"; resolution_notes?: string }) =>
      updateDriverReportStatus(args.id, {
        operating_company_id: operatingCompanyId,
        status: args.status,
        resolution_notes: args.resolution_notes,
      }),
    onSuccess: async () => {
      pushToast("Driver report updated", "success");
      await qc.invalidateQueries({ queryKey: ["maintenance", "driver-reports", operatingCompanyId] });
    },
  });

  function reportedAt(iso: string) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  // Real DriverReportRow fields only — driver is the linkable record (no unit_id / linked_wo_id on this
  // entity; Load shown as text since there is no confirmed dispatch load-detail route to link safely).
  const columns: Array<ParityColumn<DriverReportRow>> = [
    { key: "reported_at", label: "Reported", sortable: true, render: (row) => reportedAt(row.reported_at) },
    { key: "report_type", label: "Type", sortable: true },
    {
      key: "driver_name",
      label: "Driver",
      sortable: true,
      render: (row) =>
        row.driver_id ? (
          <Link to={`/drivers/${row.driver_id}`} className={LINK}>
            {row.driver_name ?? row.driver_id}
          </Link>
        ) : (
          "—"
        ),
    },
    { key: "load_number", label: "Load", render: (row) => row.load_number ?? row.load_id ?? "—" },
    {
      key: "description",
      label: "Description",
      render: (row) => (
        <div>
          <p className="whitespace-pre-wrap text-xs text-gray-700">{row.description}</p>
          {row.latitude != null && row.longitude != null ? (
            <p className="mt-1 text-[11px] text-gray-500">
              {row.latitude}, {row.longitude}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "evidence",
      label: "Evidence",
      render: (row) => (
        <div className="text-[11px] text-gray-700">
          Photos: {row.photo_r2_paths?.length ?? 0} · Voice: {row.voice_memo_r2_path ? "yes" : "no"}
        </div>
      ),
    },
    { key: "status", label: "Status", sortable: true },
  ];

  const rowActions = (row: DriverReportRow) => (
    <div className="w-56 space-y-1">
      <textarea
        rows={2}
        className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
        placeholder="Resolution notes..."
        value={resolutionDraft[row.id] ?? ""}
        onChange={(event) => setResolutionDraft((current) => ({ ...current, [row.id]: event.target.value }))}
      />
      <div className="flex gap-1">
        <Button size="sm" variant="secondary" onClick={() => mut.mutate({ id: row.id, status: "under_review" })}>
          Review
        </Button>
        <Button size="sm" onClick={() => mut.mutate({ id: row.id, status: "resolved", resolution_notes: resolutionDraft[row.id] ?? undefined })}>
          Resolve
        </Button>
        <Button size="sm" variant="danger" onClick={() => mut.mutate({ id: row.id, status: "dismissed", resolution_notes: resolutionDraft[row.id] ?? undefined })}>
          Dismiss
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Driver Reports Queue</h2>
      </div>

      <ParityTable<DriverReportRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={q.isLoading}
        emptyText="No driver reports found."
        storageKey="maint-damage-reports"
        exportFilename="driver-reports"
        rowActions={rowActions}
        filterBar={
          <div className="flex flex-wrap items-center gap-2">
            <SelectCombobox
              className="min-h-12 rounded border border-gray-300 px-2 text-sm sm:h-9 sm:min-h-0"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "" | DriverReportRow["status"])}
            >
              <option value="">All statuses</option>
              <option value="submitted">submitted</option>
              <option value="under_review">under_review</option>
              <option value="resolved">resolved</option>
              <option value="dismissed">dismissed</option>
            </SelectCombobox>
            <input
              className="min-h-12 w-full max-w-xs rounded border border-gray-300 px-2 text-sm sm:h-9 sm:min-h-0"
              placeholder="Search type / driver / load / description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        }
      />
    </div>
  );
}
