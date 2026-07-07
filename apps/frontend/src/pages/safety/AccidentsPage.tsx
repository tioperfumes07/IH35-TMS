import { useState } from "react";
import { formatDateUS } from "../../lib/formatDate";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSafetyAccidents } from "../../api/safety";
import { Button } from "../../components/Button";
import { AccidentReportDrawer } from "../../components/safety/AccidentReportDrawer";
import { companyNow } from "../../lib/businessDate";
import { EntityLink } from "../../components/shared/EntityLink";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

type AccidentRow = Record<string, unknown>;

type Props = {
  operatingCompanyId: string;
};

// SAFE-1: render the persisted fault / DOT-preventability determinations. Null = not yet assessed.
function formatAtFault(value: unknown): string {
  if (value === "yes") return "Yes";
  if (value === "no") return "No";
  if (value === "disputed") return "Disputed";
  return "—";
}

function formatPreventable(value: unknown): string {
  if (value === true) return "Preventable";
  if (value === false) return "Not Preventable";
  return "—";
}

function createDraftAccident(): Record<string, unknown> {
  return {
    id: "__create__",
    status: "open",
    accident_at: companyNow(),
    location: "",
    notes: "",
    driver_id: "",
    unit_id: "",
  };
}

export function AccidentsPage({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedAccident, setSelectedAccident] = useState<Record<string, unknown> | null>(null);

  const accidentsQuery = useQuery({
    queryKey: ["safety", "accidents", operatingCompanyId],
    queryFn: () => getSafetyAccidents(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const rows = accidentsQuery.data?.accidents ?? [];
  const createMode = String(selectedAccident?.id ?? "") === "__create__";

  const openAccident = (row: Record<string, unknown>) => {
    setSelectedAccident(row);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedAccident(null);
  };

  // Migrated to the shared QBO-parity grid — columns, order, and the per-row "Open accident"
  // action are preserved verbatim (§7 additive-only).
  const columns: Array<ParityColumn<AccidentRow>> = [
    { key: "accident_at", label: "Date", sortable: true, render: (row) => formatDateUS(row.accident_at) },
    { key: "driver_id", label: "Driver", render: (row) => <EntityLink kind="driver" id={row.driver_id as string | undefined} /> },
    { key: "unit_id", label: "Unit", render: (row) => <EntityLink kind="unit" id={row.unit_id as string | undefined} /> },
    { key: "location", label: "Location", render: (row) => String(row.location ?? row.description ?? "—") },
    { key: "at_fault", label: "At Fault", cellClass: "capitalize", render: (row) => formatAtFault(row.at_fault) },
    { key: "preventable", label: "Preventable", render: (row) => formatPreventable(row.preventable) },
    { key: "status", label: "Status", sortable: true, render: (row) => String(row.status ?? "open") },
    {
      key: "action",
      label: "Action",
      render: (row) => (
        <button type="button" className="text-slate-700 underline" onClick={() => openAccident(row)}>
          Open accident
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-3" data-testid="accidents-page">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-gray-200 bg-white px-3 py-2">
        <div>
          <div className="text-sm font-semibold text-slate-800">Accidents & Incidents</div>
          <div className="text-[11px] text-slate-500">Live accident reports with damage details, photos, and maintenance WO spawn.</div>
        </div>
        <Button
          size="sm"
          data-testid="accidents-create-btn"
          onClick={() => {
            setSelectedAccident(createDraftAccident());
            setDrawerOpen(true);
          }}
        >
          + Create Accident
        </Button>
      </div>

      <ParityTable<AccidentRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => String(row.id)}
        loading={accidentsQuery.isLoading}
        emptyText="No accident reports found."
        storageKey="safety-accidents"
        exportFilename="accidents"
        tableTestId="accidents-table"
        rowTestId={(row) => `accident-row-${String(row.id)}`}
      />

      <AccidentReportDrawer
        open={drawerOpen}
        operatingCompanyId={operatingCompanyId}
        accident={selectedAccident}
        createMode={createMode}
        onClose={closeDrawer}
        onUpdated={() => {
          void queryClient.invalidateQueries({ queryKey: ["safety"] });
        }}
      />
    </div>
  );
}
