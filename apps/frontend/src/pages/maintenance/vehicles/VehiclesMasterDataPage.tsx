import { useEffect, useMemo, useRef, useState } from "react";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createMaintenanceVehicle,
  importMaintenanceVehicles,
  listMaintenanceVehicles,
  type MaintenanceVehicleRow,
  updateMaintenanceVehicle,
  voidMaintenanceVehicle,
} from "../../../api/maintenance";
import { VoidReasonModal } from "../../../components/accounting/VoidReasonModal";
import { Button } from "../../../components/Button";
import { ListErrorState } from "../../../components/ListErrorState";
import { Modal } from "../../../components/Modal";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { PageHeader } from "../../../components/forms/shared/PageHeader";
import { useToast } from "../../../components/Toast";
import { useCompanyContext } from "../../../contexts/CompanyContext";

const LINK = "text-slate-700 hover:underline";

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
  const [voiding, setVoiding] = useState<MaintenanceVehicleRow | null>(null);
  const actionGenerationRef = useRef(0);

  const vehiclesQuery = useQuery({
    queryKey: ["maintenance", "master-data", "vehicles", companyId, search],
    queryFn: () => listMaintenanceVehicles(companyId, { search }),
    enabled: Boolean(companyId),
  });

  const refresh = async (submittedCompanyId: string) => {
    await queryClient.invalidateQueries({ queryKey: ["maintenance", "master-data", "vehicles", submittedCompanyId] });
  };

  const createMutation = useMutation({
    mutationFn: (input: { companyId: string; generation: number; draft: VehicleDraft }) =>
      createMaintenanceVehicle(input.companyId, {
        unit_display_id: input.draft.unit_display_id,
        vehicle_type: input.draft.vehicle_type || undefined,
        make: input.draft.make || undefined,
        model: input.draft.model || undefined,
        year: input.draft.year ? Number(input.draft.year) : undefined,
        vin: input.draft.vin,
        plate: input.draft.plate || undefined,
        mileage: input.draft.mileage ? Number(input.draft.mileage) : undefined,
        status: input.draft.status,
        notes: input.draft.notes || undefined,
      }),
    onSuccess: async (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      setCreateOpen(false);
      setDraft(EMPTY_DRAFT);
      await refresh(input.companyId);
      pushToast("Vehicle created", "success");
    },
    onError: (_error, input) => {
      if (input.generation === actionGenerationRef.current) pushToast("Failed to create vehicle", "error");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: { companyId: string; generation: number; row: MaintenanceVehicleRow }) =>
      updateMaintenanceVehicle(input.row.id, input.companyId, {
        vehicle_type: input.row.vehicle_type,
        make: input.row.make,
        model: input.row.model,
        year: input.row.year,
        vin: input.row.vin,
        plate: input.row.plate,
        mileage: input.row.mileage,
        status: input.row.status as VehicleDraft["status"],
        notes: input.row.notes,
      }),
    onSuccess: async (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      setEditing(null);
      await refresh(input.companyId);
      pushToast("Vehicle updated", "success");
    },
    onError: (_error, input) => {
      if (input.generation === actionGenerationRef.current) pushToast("Failed to update vehicle", "error");
    },
  });

  const importMutation = useMutation({
    mutationFn: (input: { companyId: string; generation: number; file: File }) =>
      importMaintenanceVehicles(input.companyId, input.file),
    onSuccess: async (result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      await refresh(input.companyId);
      setCsvFile(null);
      pushToast(`Vehicle import completed (${String(result.inserted_rows ?? 0)} inserted)`, "success");
    },
    onError: (_error, input) => {
      if (input.generation === actionGenerationRef.current) pushToast("Vehicle CSV import failed", "error");
    },
  });

  const voidMutation = useMutation({
    mutationFn: (input: { id: string; companyId: string; generation: number; reason: string }) =>
      voidMaintenanceVehicle(input.id, input.companyId, input.reason),
    onSuccess: async (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      setVoiding(null);
      await refresh(input.companyId);
      pushToast("Vehicle voided", "success");
    },
    onError: (_error, input) => {
      if (input.generation === actionGenerationRef.current) pushToast("Failed to void vehicle", "error");
    },
  });

  useEffect(() => {
    actionGenerationRef.current += 1;
    createMutation.reset();
    updateMutation.reset();
    importMutation.reset();
    voidMutation.reset();
    setCreateOpen(false);
    setEditing(null);
    setCsvFile(null);
    setVoiding(null);
    setDraft(EMPTY_DRAFT);
  }, [companyId]);

  useEffect(() => {
    if (!vehiclesQuery.isError) return;
    actionGenerationRef.current += 1;
    createMutation.reset();
    updateMutation.reset();
    importMutation.reset();
    voidMutation.reset();
    setCreateOpen(false);
    setEditing(null);
    setCsvFile(null);
    setVoiding(null);
    setDraft(EMPTY_DRAFT);
  }, [vehiclesQuery.isError]);

  const rows = useMemo(() => vehiclesQuery.data?.rows ?? [], [vehiclesQuery.data?.rows]);
  const csvEnabled = vehiclesQuery.data?.csv_import_enabled ?? false;

  // Universal-list columns. Unit links to the fleet unit detail (row.id IS mdata.units.id).
  const columns: Array<ParityColumn<MaintenanceVehicleRow>> = [
    {
      key: "unit_display_id",
      label: "Unit",
      sortable: true,
      render: (row) => (
        <EntityLink
          kind="unit"
          id={row.id}
          label={entityLabel(row.unit_display_id, row.id, "Unit")}
          className={`${LINK} font-semibold`}
          data-testid="maintenance-vehicles-master-unit-link"
        />
      ),
    },
    {
      key: "vehicle",
      label: "Vehicle",
      render: (row) =>
        [row.year, row.make, row.model].filter(Boolean).join(" ") || row.vehicle_type || "—",
    },
    { key: "vin", label: "VIN / Plate", render: (row) => `${row.vin} / ${row.plate ?? "—"}` },
    { key: "status", label: "Status", sortable: true },
    {
      key: "source",
      label: "Source",
      sortable: true,
      render: (row) => (
        <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">{row.source}</span>
      ),
    },
  ];

  const rowActions = (row: MaintenanceVehicleRow) => (
    <div className="flex gap-2">
      <button type="button" className="text-slate-600 underline" onClick={() => setEditing(row)}>
        Edit
      </button>
      <button
        type="button"
        className="text-red-600 underline"
        onClick={() => setVoiding(row)}
      >
        Void
      </button>
    </div>
  );

  return (
    <div className="space-y-3">
      {/*
        UI-BACK-BUTTON-MISSING-ENTIRELY: this leaf route (/maintenance/vehicles) had a bespoke
        title bar with no back control at all -- part of a systemwide route-manifest audit that
        found 13 such Maintenance leaves with no shared wrapper to fix in one shot. Replaced with
        the standard PageHeader (backHref="/maintenance", the module hub) so it gets the same
        smart-back wiring as the rest of the app instead of yet another bespoke back button.
      */}
      <PageHeader
        title="Maintenance Vehicles"
        subtitle="Create, edit, void, and review projected source status."
        breadcrumb={[{ label: "Maintenance" }, { label: "Vehicles" }]}
        backHref="/maintenance"
        actions={
          <div className="flex items-center gap-2">
            {/* MAINT-F3520: server-bound vehicles search — keep; ParityTable toolbar Search suppressed */}
            <input
              className="h-8 rounded-sm border border-gray-300 px-2 text-xs"
              aria-label="Search vehicles"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search vehicles"
            />
            <Button size="sm" variant="secondary" disabled={vehiclesQuery.isError} onClick={() => setCreateOpen(true)}>
              + Create
            </Button>
          </div>
        }
      />

      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="mb-3 flex items-center gap-2">
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={vehiclesQuery.isError || !csvEnabled}
            onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)}
            className="text-xs"
          />
          <Button size="sm" variant="secondary" disabled={vehiclesQuery.isError || !csvEnabled || !csvFile} onClick={() => {
            if (!csvFile) return;
            importMutation.mutate({ companyId, generation: actionGenerationRef.current, file: csvFile });
          }}>
            CSV Import
          </Button>
          {!vehiclesQuery.isError && !csvEnabled ? <span className="text-[11px] text-amber-700">CSV fallback disabled for projected entity</span> : null}
        </div>
        {vehiclesQuery.isError ? (
          <ListErrorState
            title="Couldn't load maintenance vehicles"
            status={0}
            message={(vehiclesQuery.error as Error)?.message}
            onRetry={() => void vehiclesQuery.refetch()}
          />
        ) : (
          <ParityTable<MaintenanceVehicleRow>
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            loading={vehiclesQuery.isLoading}
            emptyText="No vehicles found."
            storageKey="maint-master-data-vehicles"
            exportFilename="maintenance-vehicles"
            rowActions={rowActions}
            // MAINT-F3520: keep API search above; hide ParityTable toolbar Search
            suppressToolbarSearch
          />
        )}
      </div>

      <Modal variant="drawer" open={createOpen} onClose={() => setCreateOpen(false)} title="Create Vehicle">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" placeholder="Unit Display ID" value={draft.unit_display_id} onChange={(e) => setDraft((p) => ({ ...p, unit_display_id: e.target.value }))} />
            <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" placeholder="Vehicle Type" value={draft.vehicle_type} onChange={(e) => setDraft((p) => ({ ...p, vehicle_type: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" placeholder="Make" value={draft.make} onChange={(e) => setDraft((p) => ({ ...p, make: e.target.value }))} />
            <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" placeholder="Model" value={draft.model} onChange={(e) => setDraft((p) => ({ ...p, model: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" placeholder="Year" type="number" value={draft.year} onChange={(e) => setDraft((p) => ({ ...p, year: e.target.value }))} />
            <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" placeholder="Mileage" type="number" value={draft.mileage} onChange={(e) => setDraft((p) => ({ ...p, mileage: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" placeholder="VIN" value={draft.vin} onChange={(e) => setDraft((p) => ({ ...p, vin: e.target.value }))} />
            <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" placeholder="Plate" value={draft.plate} onChange={(e) => setDraft((p) => ({ ...p, plate: e.target.value }))} />
          </div>
          <textarea className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs" rows={3} placeholder="Notes" value={draft.notes} onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))} />
          <Button disabled={vehiclesQuery.isError || !draft.unit_display_id || !draft.vin || createMutation.isPending} onClick={() => createMutation.mutate({ companyId, generation: actionGenerationRef.current, draft: { ...draft } })}>
            Save
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit Vehicle">
        {editing ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" value={editing.vehicle_type ?? ""} onChange={(e) => setEditing((p) => (p ? { ...p, vehicle_type: e.target.value } : p))} />
              <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" value={editing.make ?? ""} onChange={(e) => setEditing((p) => (p ? { ...p, make: e.target.value } : p))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" value={editing.model ?? ""} onChange={(e) => setEditing((p) => (p ? { ...p, model: e.target.value } : p))} />
              <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" type="number" value={editing.year ?? ""} onChange={(e) => setEditing((p) => (p ? { ...p, year: e.target.value ? Number(e.target.value) : null } : p))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" value={editing.vin} onChange={(e) => setEditing((p) => (p ? { ...p, vin: e.target.value } : p))} />
              <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" value={editing.plate ?? ""} onChange={(e) => setEditing((p) => (p ? { ...p, plate: e.target.value } : p))} />
            </div>
            <textarea className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs" rows={3} value={editing.notes ?? ""} onChange={(e) => setEditing((p) => (p ? { ...p, notes: e.target.value } : p))} />
            <Button onClick={() => updateMutation.mutate({ companyId, generation: actionGenerationRef.current, row: { ...editing } })} disabled={vehiclesQuery.isError || updateMutation.isPending}>Save Changes</Button>
          </div>
        ) : null}
      </Modal>

      <VoidReasonModal
        open={Boolean(voiding)}
        title="Void Vehicle"
        entityRef={voiding ? entityLabel(voiding.vin, voiding.id, "Vehicle") : undefined}
        minLength={1}
        postsReversingEntry={false}
        submitLabel="Void"
        onClose={() => setVoiding(null)}
        onSubmit={async (reason) => {
          if (!voiding || vehiclesQuery.isError) return;
          await voidMutation.mutateAsync({ id: voiding.id, companyId, generation: actionGenerationRef.current, reason });
        }}
      />
    </div>
  );
}
