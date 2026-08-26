/**
 * @archived — Safety active-path (V6.4)
 * Superseded by `tabs/DOTInspectionsTab.tsx` (safetyV64 API + ParityTable) at `/safety/dot-inspections`.
 * ARCHIVE-not-DELETE: retained for reference / deprecated SafetyHome.tsx cluster only.
 * Do not re-mount in routes/manifest.tsx. Sunset: 2026-09-01.
 */
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatDateUS } from "../../lib/formatDate";
import { DatePicker } from "../../components/forms/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createDotInspection, followUpDotInspectionEvent, getDotInspections, listDotInspectionEvents } from "../../api/safety";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { companyToday } from "../../lib/businessDate";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";

type Props = {
  operatingCompanyId: string;
};

type DotInspectionRow = Record<string, unknown>;

export function DotInspectionsPage({ operatingCompanyId }: Props) {
  // SAF-B30 drill-through: EntityLink routes here with ?inspection_id=, but nothing read it, so the link
  // navigated and then did nothing — a facade. Same highlight pattern as TransfersListPage
  // (?transfer_id=), which is the in-repo precedent for a table-only surface with no drawer.
  const [searchParams] = useSearchParams();
  const deepLinkInspectionId = searchParams.get("inspection_id")?.trim() || "";
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    inspection_date: companyToday(),
    inspector_name: "",
    inspection_level: 1,
    outcome: "PASS",
    notes: "",
  });

  const query = useQuery({
    queryKey: ["safety", "dot-inspections", operatingCompanyId],
    queryFn: () => getDotInspections(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const createMutation = useMutation({
    mutationFn: () => createDotInspection(operatingCompanyId, form),
    onSuccess: async () => {
      setForm({ inspection_date: companyToday(), inspector_name: "", inspection_level: 1, outcome: "PASS", notes: "" });
      await queryClient.invalidateQueries({ queryKey: ["safety", "dot-inspections", operatingCompanyId] });
    },
  });

  const openEventsQuery = useQuery({
    queryKey: ["safety", "dot-inspection-events", operatingCompanyId],
    queryFn: () => listDotInspectionEvents(operatingCompanyId, "open"),
    enabled: Boolean(operatingCompanyId),
  });

  const followUpMutation = useMutation({
    mutationFn: (payload: { id: string; state: "reviewed" | "citation" | "clean" }) =>
      followUpDotInspectionEvent(payload.id, operatingCompanyId, payload.state),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safety", "dot-inspection-events", operatingCompanyId] });
    },
  });

  // Migrated to the shared QBO-parity grid — columns and order are preserved verbatim (§7 additive-only).
  const columns: Array<ParityColumn<DotInspectionRow>> = [
    { key: "inspection_date", label: "Date", sortable: true, render: (row) => formatDateUS(row.inspection_date) },
    { key: "inspector_name", label: "Inspector", render: (row) => String(row.inspector_name ?? "—") },
    { key: "inspection_level", label: "Level", sortable: true, render: (row) => String(row.inspection_level ?? "—") },
    { key: "outcome", label: "Outcome", sortable: true, render: (row) => String(row.outcome ?? "—") },
    { key: "spawned_wo_id", label: "Spawned WO", render: (row) => String(row.spawned_wo_id ?? "—") },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded-sm border border-gray-200 bg-white p-3 md:grid-cols-5">
        <div>
          <label className="sr-only" htmlFor="dot-inspection-page-date">Inspection date</label>
          <DatePicker id="dot-inspection-page-date" value={form.inspection_date} onChange={(next) => setForm((v) => ({ ...v, inspection_date: next }))} className="" />
        </div>
        <input value={form.inspector_name} placeholder="Inspector name" onChange={(e) => setForm((v) => ({ ...v, inspector_name: e.target.value }))} className="rounded-sm border border-gray-300 px-2 py-1 text-xs" />
        <input value={form.inspection_level} type="number" min={1} max={6} onChange={(e) => setForm((v) => ({ ...v, inspection_level: Number(e.target.value || 1) }))} className="rounded-sm border border-gray-300 px-2 py-1 text-xs" />
        <SelectCombobox value={form.outcome} onChange={(e) => setForm((v) => ({ ...v, outcome: e.target.value }))} className="rounded-sm border border-gray-300 px-2 py-1 text-xs">
          <option value="PASS">PASS</option>
          <option value="WARNING">WARNING</option>
          <option value="OOS">OOS</option>
        </SelectCombobox>
        <button type="button" onClick={() => createMutation.mutate()} disabled={!form.inspector_name.trim() || createMutation.isPending} className="rounded-sm bg-[#1F2A44] px-3 py-1 text-xs font-semibold text-white">
          + Create DOT Inspection
        </button>
        {createMutation.isError ? (
          <p className="text-xs text-red-700 md:col-span-5" data-testid="dot-inspection-create-error">
            {userFacingApiError(createMutation.error, "Could not create the DOT inspection.")}
          </p>
        ) : null}
      </div>
      {query.isError ? (
        <ListErrorState
          title="Couldn't load DOT inspections"
          status={0}
          message={(query.error as Error)?.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <ParityTable<DotInspectionRow>
          columns={columns}
          rows={query.data?.dot_inspections ?? []}
          rowKey={(row) => String(row.id)}
          rowClassName={(row) =>
            deepLinkInspectionId && String(row.id) === deepLinkInspectionId ? "bg-slate-100 ring-1 ring-slate-400" : ""
          }
          loading={query.isLoading}
          emptyText="No DOT inspections recorded."
          storageKey="safety-dot-inspections"
          exportFilename="dot-inspections"
        />
      )}
      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <h3 className="mb-2 text-xs font-semibold text-gray-800">Open DOT Station Dwell Events (last captured)</h3>
        {(openEventsQuery.data?.events ?? []).length === 0 ? (
          <p className="text-xs text-gray-500">No open DOT dwell follow-ups.</p>
        ) : (
          <div className="space-y-2">
            {(openEventsQuery.data?.events ?? []).slice(0, 20).map((row) => (
              <div key={String(row.id)} className="rounded-sm border border-gray-200 p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-gray-800">
                    {String(row.station_label ?? "DOT station")} · Unit{" "}
                    <EntityLinkOrTombstone kind="unit" id={row.unit_id as string | undefined} name={row.unit_number} noun="Unit" />
                  </span>
                  <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-slate-700">{String(row.dwell_minutes ?? 0)} min</span>
                </div>
                <p className="mt-1 text-gray-600">
                  Driver:{" "}
                  <EntityLinkOrTombstone kind="driver" id={row.driver_id as string | undefined} name={row.driver_name} noun="Driver" />{" "}
                  · Departed: {String(row.departed_at ?? "n/a")}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-sm bg-[#1F2A44] px-2 py-1 text-[11px] font-semibold text-white"
                    onClick={() => followUpMutation.mutate({ id: String(row.id), state: "reviewed" })}
                  >
                    Mark Reviewed
                  </button>
                  <button
                    type="button"
                    className="rounded-sm bg-red-700 px-2 py-1 text-[11px] font-semibold text-white"
                    onClick={() => followUpMutation.mutate({ id: String(row.id), state: "citation" })}
                  >
                    Mark Citation
                  </button>
                  <button
                    type="button"
                    className="rounded-sm bg-[#1f2a44] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#0f1729]"
                    onClick={() => followUpMutation.mutate({ id: String(row.id), state: "clean" })}
                  >
                    Mark Clean
                  </button>
                </div>
              </div>
            ))}
            {followUpMutation.isError ? (
              <p className="text-xs text-red-700" data-testid="dot-inspection-page-followup-error">
                {userFacingApiError(followUpMutation.error, "Could not update the DOT follow-up.")}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
