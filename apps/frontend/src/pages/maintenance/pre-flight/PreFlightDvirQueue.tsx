import { Link, useSearchParams } from "react-router-dom";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listPreFlightDvirQueue,
  routePreFlightDvirDefect,
  setPreFlightDvirSeverity,
  type DvirSeverityLevel,
  type PreFlightDvirQueueRow,
} from "../../../api/maintenance";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { Button } from "../../../components/Button";
import { EntityLink } from "../../../components/shared/EntityLink";
import { useToast } from "../../../components/Toast";
import { PageHeader } from "../../../components/forms/shared/PageHeader";
import { DvirSeverityBadge } from "../../../components/maintenance/DvirSeverityBadge";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";

const TABS: Array<{ key: DvirSeverityLevel; label: string }> = [
  { key: "major", label: "Major" },
  { key: "minor", label: "Minor" },
  { key: "observation", label: "Observations" },
];
const TAB_IDS = new Set<string>(TABS.map((t) => t.key));

export function parsePreFlightDvirTab(raw: string | null): DvirSeverityLevel {
  if (raw && TAB_IDS.has(raw)) return raw as DvirSeverityLevel;
  return "major";
}

export function PreFlightDvirQueue() {
  const { selectedCompanyId, companies } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? companies[0]?.id ?? "";
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parsePreFlightDvirTab(searchParams.get("tab"));
  const setTab = (next: DvirSeverityLevel) => {
    const params = new URLSearchParams(searchParams);
    if (next === "major") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  // FLAGGED (QA-sweep): the `/api/v1/maintenance/pre-flight-dvir/*` backend (queue + severity +
  // route-to-WO) is not built yet — it needs a dedicated maintenance block (auto-WO creation is
  // non-trivial). Until then this screen degrades to an empty/unavailable state; `retry: false`
  // avoids hammering the missing endpoint.
  const q = useQuery({
    queryKey: ["maintenance", "pre-flight-dvir", operatingCompanyId, tab],
    queryFn: () => listPreFlightDvirQueue(operatingCompanyId, { severity: tab, status: "open" }),
    enabled: Boolean(operatingCompanyId),
    retry: false,
  });

  const rows = useMemo(() => q.data?.defects ?? [], [q.data?.defects]);

  const routeMut = useMutation({
    mutationFn: (defectId: string) => routePreFlightDvirDefect(defectId, operatingCompanyId),
    onSuccess: async (result) => {
      if (result.action === "work_order_created") {
        pushToast(`Work order ${result.display_id ?? result.work_order_id} created`, "success");
      } else if (result.action === "queued_next_pm") {
        pushToast("Queued for next PM service", "success");
      } else if (result.action === "logged_observation") {
        pushToast("Logged observation (no work order)", "success");
      } else {
        pushToast("Defect already routed", "info");
      }
      await qc.invalidateQueries({ queryKey: ["maintenance", "pre-flight-dvir", operatingCompanyId] });
    },
    onError: () => pushToast("Routing failed", "error"),
  });

  const downgradeMut = useMutation({
    mutationFn: (defectId: string) =>
      setPreFlightDvirSeverity(defectId, { operating_company_id: operatingCompanyId, severity: "minor" }),
    onSuccess: async () => {
      pushToast("Severity set to minor", "success");
      await qc.invalidateQueries({ queryKey: ["maintenance", "pre-flight-dvir", operatingCompanyId] });
    },
    onError: () => pushToast("Severity change blocked — Manager+ role required for major changes", "error"),
  });

  const columns = useMemo<ParityColumn<PreFlightDvirQueueRow>[]>(
    () => [
      {
        key: "submitted_at",
        label: "Submitted",
        sortable: true,
        render: (row) => (row.submitted_at ? new Date(row.submitted_at).toLocaleString() : "—"),
      },
      { key: "unit_id", label: "Unit", render: (row) => <EntityLink kind="unit" id={row.unit_id} label={row.unit_number ?? undefined} /> },
      { key: "driver_name", label: "Driver", sortable: true, render: (row) => <EntityLink kind="driver" id={row.driver_id ?? undefined} label={row.driver_name ?? "—"} /> },
      { key: "item_key", label: "Item", sortable: true, render: (row) => <span title={row.notes ?? undefined}>{row.item_key}</span> },
      { key: "severity", label: "Severity", sortable: true, render: (row) => <DvirSeverityBadge severity={row.severity} /> },
      { key: "major_defect_code", label: "CFR Code", render: (row) => row.major_defect_code ?? "—" },
      {
        key: "auto_wo_id",
        label: "Work Order",
        render: (row) =>
          row.auto_wo_id ? (
            <Link to={`/maintenance/work-orders/${row.auto_wo_id}`} className="text-slate-700 underline" data-testid={`dvir-wo-link-${row.id}`}>
              View WO
            </Link>
          ) : (
            "—"
          ),
      },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        render: (row) => (
          <div className="flex flex-wrap gap-1">
            {!row.routed ? (
              <Button size="sm" onClick={() => routeMut.mutate(row.id)} disabled={routeMut.isPending}>
                {row.severity === "major" ? "Create WO" : "Route"}
              </Button>
            ) : null}
            {row.severity === "major" ? (
              <Button size="sm" variant="secondary" onClick={() => downgradeMut.mutate(row.id)} disabled={downgradeMut.isPending}>
                Downgrade to minor
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [routeMut, downgradeMut],
  );

  return (
    <div className="space-y-4" data-testid="pre-flight-dvir-queue">
      <PageHeader
        title="Pre-Flight DVIR Queue"
        subtitle="Major defects block dispatch (49 CFR §396.11). Minor defects queue for next PM; observations log only."
      />

      <div className="flex items-center gap-2 border-b border-gray-200">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            data-testid={`dvir-severity-tab-${entry.key}`}
            onClick={() => setTab(entry.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === entry.key
                ? "border-slate-600 text-slate-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <ParityTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        loading={q.isPending}
        storageKey="maintenance-pre-flight-dvir"
        emptyText={`No ${tab} DVIR defects in this queue.`}
        exportFilename="pre-flight-dvir-queue"
        tableTestId="pre-flight-dvir-table"
        rowTestId={(row) => `dvir-queue-row-${row.id}`}
      />
    </div>
  );
}
