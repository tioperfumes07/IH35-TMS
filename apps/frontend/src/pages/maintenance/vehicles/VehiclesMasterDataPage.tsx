import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createMaintenanceVehicle,
  importMaintenanceVehicles,
  listMaintenanceVehicles,
  type MaintenanceVehicleRow,
  updateMaintenanceVehicle,
  voidMaintenanceVehicle,
} from "../../../api/maintenance";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import { useCompanyContext } from "../../../contexts/CompanyContext";

type VehicleDraft = {
  unit_display_id: string;
  vehicle_type: string;
  make: string;
  model: string;
  year: string;
  vin: string;
  plate: string;
  mileage: string;
  status: "InService" | "OutOfService" | "InMaintenance" | "Sold" | "Totaled";
  notes: string;
};

const EMPTY_DRAFT: VehicleDraft = {
  unit_display_id: "",
  vehicle_type: "",
  make: "",
  model: "",
  year: "",
  vin: "",
  plate: "",
  mileage: "",
  status: "InService",
  notes: "",
};

export function VehiclesMasterDataPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<VehicleDraft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<MaintenanceVehicleRow | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const vehiclesQuery = useQuery({
    queryKey: ["maintenance", "master-data", "vehicles", companyId, search],
    queryFn: () => listMaintenanceVehicles(companyId, { search }),
    enabled: Boolean(companyId),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["maintenance", "master-data", "vehicles", companyId] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createMaintenanceVehicle(companyId, {
        unit_display_id: draft.unit_display_id,
        vehicle_type: draft.vehicle_type || undefined,
        make: draft.make || undefined,
        model: draft.model || undefined,
        year: draft.year ? Number(draft.year) : undefined,
        vin: draft.vin,
        plate: draft.plate || undefined,
        mileage: draft.mileage ? Number(draft.mileage) : undefined,
        status: draft.status,
        notes: draft.notes || undefined,
      }),
    onSuccess: async () => {
      setCreateOpen(false);
      setDraft(EMPTY_DRAFT);
      await refresh();
      pushToast("Vehicle created", "success");
    },
    onError: () => pushToast("Failed to create vehicle", "error"),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error("No vehicle selected");
      return updateMaintenanceVehicle(editing.id, companyId, {
        vehicle_type: editing.vehicle_type,
        make: editing.make,
        model: editing.model,
        year: editing.year,
        vin: editing.vin,
        plate: editing.plate,
        mileage: editing.mileage,
        status: editing.status as VehicleDraft["status"],
        notes: editing.notes,
      });
    },
    onSuccess: async () => {
      setEditing(null);
      await refresh();
      pushToast("Vehicle updated", "success");
    },
    onError: () => pushToast("Failed to update vehicle", "error"),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!csvFile) throw new Error("File required");
      return importMaintenanceVehicles(companyId, csvFile);
    },
    onSuccess: async (result) => {
      await refresh();
      setCsvFile(null);
      pushToast(`Vehicle import completed (${String(result.inserted_rows ?? 0)} inserted)`, "success");
    },
    onError: () => pushToast("Vehicle CSV import failed", "error"),
  });

  const rows = useMemo(() => vehiclesQuery.data?.rows ?? [], [vehiclesQuery.data?.rows]);
  const csvEnabled = vehiclesQuery.data?.csv_import_enabled ?? false;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded border border-gray-200 bg-white p-3">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Maintenance Vehicles</h1>
          <p className="text-xs text-gray-600">Create, edit, void, and review projected source status.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="h-8 rounded border border-gray-300 px-2 text-xs"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search vehicles"
          />
          <Button size="sm" variant="secondary" onClick={() => setCreateOpen(true)}>
            + Create
          </Button>
        </div>
      </div>

      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="mb-3 flex items-center gap-2">
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={!csvEnabled}
            onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)}
            className="text-xs"
          />
          <Button size="sm" variant="secondary" disabled={!csvEnabled || !csvFile} onClick={() => importMutation.mutate()}>
            CSV Import
          </Button>
          {!csvEnabled ? <span className="text-[11px] text-amber-700">CSV fallback disabled for projected entity</span> : null}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="px-2 py-2">Unit</th>
                <th className="px-2 py-2">Vehicle</th>
                <th className="px-2 py-2">VIN / Plate</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Source</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100">
                  <td className="px-2 py-2 font-semibold">{row.unit_display_id}</td>
                  <td className="px-2 py-2">{[row.year, row.make, row.model].filter(Boolean).join(" ") || row.vehicle_type || "—"}</td>
                  <td className="px-2 py-2">{row.vin} / {row.plate ?? "—"}</td>
                  <td className="px-2 py-2">{row.status}</td>
                  <td className="px-2 py-2">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">{row.source}</span>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex gap-2">
                      <button type="button" className="text-blue-600 underline" onClick={() => setEditing(row)}>Edit</button>
                      <button
                        type="button"
                        className="text-red-600 underline"
                        onClick={async () => {
                          const reason = window.prompt("Void reason");
                          if (!reason) return;
                          await voidMaintenanceVehicle(row.id, companyId, reason);
                          await refresh();
                        }}
                      >
                        Void
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td className="px-2 py-6 text-center text-gray-500" colSpan={6}>No vehicles found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Vehicle">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className="h-8 rounded border border-gray-300 px-2 text-xs" placeholder="Unit Display ID" value={draft.unit_display_id} onChange={(e) => setDraft((p) => ({ ...p, unit_display_id: e.target.value }))} />
            <input className="h-8 rounded border border-gray-300 px-2 text-xs" placeholder="Vehicle Type" value={draft.vehicle_type} onChange={(e) => setDraft((p) => ({ ...p, vehicle_type: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="h-8 rounded border border-gray-300 px-2 text-xs" placeholder="Make" value={draft.make} onChange={(e) => setDraft((p) => ({ ...p, make: e.target.value }))} />
            <input className="h-8 rounded border border-gray-300 px-2 text-xs" placeholder="Model" value={draft.model} onChange={(e) => setDraft((p) => ({ ...p, model: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="h-8 rounded border border-gray-300 px-2 text-xs" placeholder="Year" type="number" value={draft.year} onChange={(e) => setDraft((p) => ({ ...p, year: e.target.value }))} />
            <input className="h-8 rounded border border-gray-300 px-2 text-xs" placeholder="Mileage" type="number" value={draft.mileage} onChange={(e) => setDraft((p) => ({ ...p, mileage: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="h-8 rounded border border-gray-300 px-2 text-xs" placeholder="VIN" value={draft.vin} onChange={(e) => setDraft((p) => ({ ...p, vin: e.target.value }))} />
            <input className="h-8 rounded border border-gray-300 px-2 text-xs" placeholder="Plate" value={draft.plate} onChange={(e) => setDraft((p) => ({ ...p, plate: e.target.value }))} />
          </div>
          <textarea className="w-full rounded border border-gray-300 px-2 py-1 text-xs" rows={3} placeholder="Notes" value={draft.notes} onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))} />
          <Button disabled={!draft.unit_display_id || !draft.vin || createMutation.isPending} onClick={() => createMutation.mutate()}>
            Save
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit Vehicle">
        {editing ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input className="h-8 rounded border border-gray-300 px-2 text-xs" value={editing.vehicle_type ?? ""} onChange={(e) => setEditing((p) => (p ? { ...p, vehicle_type: e.target.value } : p))} />
              <input className="h-8 rounded border border-gray-300 px-2 text-xs" value={editing.make ?? ""} onChange={(e) => setEditing((p) => (p ? { ...p, make: e.target.value } : p))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className="h-8 rounded border border-gray-300 px-2 text-xs" value={editing.model ?? ""} onChange={(e) => setEditing((p) => (p ? { ...p, model: e.target.value } : p))} />
              <input className="h-8 rounded border border-gray-300 px-2 text-xs" type="number" value={editing.year ?? ""} onChange={(e) => setEditing((p) => (p ? { ...p, year: e.target.value ? Number(e.target.value) : null } : p))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className="h-8 rounded border border-gray-300 px-2 text-xs" value={editing.vin} onChange={(e) => setEditing((p) => (p ? { ...p, vin: e.target.value } : p))} />
              <input className="h-8 rounded border border-gray-300 px-2 text-xs" value={editing.plate ?? ""} onChange={(e) => setEditing((p) => (p ? { ...p, plate: e.target.value } : p))} />
            </div>
            <textarea className="w-full rounded border border-gray-300 px-2 py-1 text-xs" rows={3} value={editing.notes ?? ""} onChange={(e) => setEditing((p) => (p ? { ...p, notes: e.target.value } : p))} />
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>Save Changes</Button>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
