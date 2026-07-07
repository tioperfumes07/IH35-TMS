import { useState } from "react";
import { formatDateUS } from "../../lib/formatDate";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSafetyAccidents } from "../../api/safety";
import { Button } from "../../components/Button";
import { AccidentReportDrawer } from "../../components/safety/AccidentReportDrawer";
import { companyNow } from "../../lib/businessDate";
import { useListState } from "../../components/list-state";
import { EntityLink } from "../../components/shared/EntityLink";

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
  // LIST-EMPTY: the empty message renders only after the accidents query settles.
  const listState = useListState(accidentsQuery, rows.length === 0);
  const createMode = String(selectedAccident?.id ?? "") === "__create__";

  const openAccident = (row: Record<string, unknown>) => {
    setSelectedAccident(row);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedAccident(null);
  };

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

      <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
        <table className="min-w-full text-xs" data-testid="accidents-table">
          <thead className="bg-gray-50 text-[10px] uppercase text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left">Date</th>
              <th className="px-2 py-1 text-left">Driver</th>
              <th className="px-2 py-1 text-left">Unit</th>
              <th className="px-2 py-1 text-left">Location</th>
              <th className="px-2 py-1 text-left">At Fault</th>
              <th className="px-2 py-1 text-left">Preventable</th>
              <th className="px-2 py-1 text-left">Status</th>
              <th className="px-2 py-1 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)} className="border-t border-gray-100" data-testid={`accident-row-${String(row.id)}`}>
                <td className="px-2 py-1">{formatDateUS(row.accident_at)}</td>
                <td className="px-2 py-1"><EntityLink kind="driver" id={row.driver_id as string | undefined} /></td>
                <td className="px-2 py-1"><EntityLink kind="unit" id={row.unit_id as string | undefined} /></td>
                <td className="px-2 py-1">{String(row.location ?? row.description ?? "—")}</td>
                <td className="px-2 py-1 capitalize">{formatAtFault(row.at_fault)}</td>
                <td className="px-2 py-1">{formatPreventable(row.preventable)}</td>
                <td className="px-2 py-1">{String(row.status ?? "open")}</td>
                <td className="px-2 py-1">
                  <button type="button" className="text-slate-700 underline" onClick={() => openAccident(row)}>
                    Open accident
                  </button>
                </td>
              </tr>
            ))}
            {listState.isEmpty ? (
              <tr>
                <td colSpan={8} className="px-2 py-3 text-center text-slate-500">
                  No accident reports found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

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
