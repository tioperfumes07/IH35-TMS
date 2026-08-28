import { useEffect, useMemo, useRef, useState } from "react";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createMaintenanceDriver,
  importMaintenanceDrivers,
  listMaintenanceDrivers,
  type MaintenanceDriverRow,
  updateMaintenanceDriver,
  voidMaintenanceDriver,
} from "../../../api/maintenance";
import { VoidReasonModal } from "../../../components/accounting/VoidReasonModal";
import { Button } from "../../../components/Button";
import { ListErrorState } from "../../../components/ListErrorState";
import { Modal } from "../../../components/Modal";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { PageHeader } from "../../../components/forms/shared/PageHeader";
import { useToast } from "../../../components/Toast";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { StateSelect } from "../../../components/forms/StateSelect";

const LINK = "text-slate-700 hover:underline";

type DriverDraft = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  cdl_number: string;
  cdl_state: string;
  status: "Active" | "Probation" | "Inactive" | "Terminated" | "OnLeave";
  notes: string;
};

const EMPTY_DRAFT: DriverDraft = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  cdl_number: "",
  cdl_state: "",
  status: "Active",
  notes: "",
};

export function DriversMasterDataPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<DriverDraft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<MaintenanceDriverRow | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [voiding, setVoiding] = useState<MaintenanceDriverRow | null>(null);
  const actionGenerationRef = useRef(0);

  const driversQuery = useQuery({
    queryKey: ["maintenance", "master-data", "drivers", companyId, search],
    queryFn: () => listMaintenanceDrivers(companyId, { search }),
    enabled: Boolean(companyId),
  });

  const refresh = async (submittedCompanyId: string) => {
    await queryClient.invalidateQueries({ queryKey: ["maintenance", "master-data", "drivers", submittedCompanyId] });
  };

  const createMutation = useMutation({
    mutationFn: (input: { companyId: string; generation: number; draft: DriverDraft }) =>
      createMaintenanceDriver(input.companyId, {
        first_name: input.draft.first_name,
        last_name: input.draft.last_name,
        phone: input.draft.phone,
        email: input.draft.email || undefined,
        cdl_number: input.draft.cdl_number || undefined,
        cdl_state: input.draft.cdl_state || undefined,
        status: input.draft.status,
        notes: input.draft.notes || undefined,
      }),
    onSuccess: async (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      setCreateOpen(false);
      setDraft(EMPTY_DRAFT);
      await refresh(input.companyId);
      pushToast("Driver created", "success");
    },
    onError: (_error, input) => {
      if (input.generation === actionGenerationRef.current) pushToast("Failed to create driver", "error");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: { companyId: string; generation: number; row: MaintenanceDriverRow }) =>
      updateMaintenanceDriver(input.row.id, input.companyId, {
        first_name: input.row.first_name,
        last_name: input.row.last_name,
        phone: input.row.phone,
        email: input.row.email,
        cdl_number: input.row.cdl_number,
        cdl_state: input.row.cdl_state,
        status: input.row.status as DriverDraft["status"],
        notes: input.row.notes,
      }),
    onSuccess: async (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      setEditing(null);
      await refresh(input.companyId);
      pushToast("Driver updated", "success");
    },
    onError: (_error, input) => {
      if (input.generation === actionGenerationRef.current) pushToast("Failed to update driver", "error");
    },
  });

  const importMutation = useMutation({
    mutationFn: (input: { companyId: string; generation: number; file: File }) =>
      importMaintenanceDrivers(input.companyId, input.file),
    onSuccess: async (result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      await refresh(input.companyId);
      setCsvFile(null);
      pushToast(`Driver import completed (${String(result.inserted_rows ?? 0)} inserted)`, "success");
    },
    onError: (_error, input) => {
      if (input.generation === actionGenerationRef.current) pushToast("Driver CSV import failed", "error");
    },
  });

  const voidMutation = useMutation({
    mutationFn: (input: { id: string; companyId: string; generation: number; reason: string }) =>
      voidMaintenanceDriver(input.id, input.companyId, input.reason),
    onSuccess: async (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      setVoiding(null);
      await refresh(input.companyId);
      pushToast("Driver voided", "success");
    },
    onError: (_error, input) => {
      if (input.generation === actionGenerationRef.current) pushToast("Failed to void driver", "error");
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
    if (!driversQuery.isError) return;
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
  }, [driversQuery.isError]);

  const rows = useMemo(() => driversQuery.data?.rows ?? [], [driversQuery.data?.rows]);
  const csvEnabled = driversQuery.data?.csv_import_enabled ?? false;

  // Universal-list columns. Driver links to the driver detail (row.id IS mdata.drivers.id).
  const columns: Array<ParityColumn<MaintenanceDriverRow>> = [
    {
      key: "last_name",
      label: "Driver",
      sortable: true,
      render: (row) => (
        <EntityLink
          kind="driver"
          id={row.id}
          label={entityLabel(`${row.first_name} ${row.last_name}`.trim(), row.id, "Driver")}
          className={`${LINK} font-semibold`}
          data-testid="maintenance-drivers-master-driver-link"
        />
      ),
    },
    {
      key: "phone",
      label: "Contact",
      render: (row) => (
        <>
          {row.phone ?? "—"}
          <br />
          {row.email ?? "—"}
        </>
      ),
    },
    {
      key: "cdl_number",
      label: "CDL",
      render: (row) => `${row.cdl_number ?? "—"} ${row.cdl_state ? `(${row.cdl_state})` : ""}`,
    },
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

  const rowActions = (row: MaintenanceDriverRow) => (
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
      {/* UI-BACK-BUTTON-MISSING-ENTIRELY: see VehiclesMasterDataPage.tsx sibling comment. */}
      <PageHeader
        title="Maintenance Drivers"
        subtitle="Manage projected drivers with manual create/edit/void controls."
        breadcrumb={[{ label: "Maintenance" }, { label: "Drivers" }]}
        backHref="/maintenance"
        actions={
          <div className="flex items-center gap-2">
            {/* MAINT-F3522: server-bound drivers search — keep; ParityTable toolbar Search suppressed */}
            <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search drivers" />
            <Button size="sm" variant="secondary" disabled={driversQuery.isError} onClick={() => setCreateOpen(true)}>+ Create</Button>
          </div>
        }
      />

      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="mb-3 flex items-center gap-2">
          <input type="file" accept=".csv,text/csv" disabled={driversQuery.isError || !csvEnabled} onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)} className="text-xs" />
          <Button size="sm" variant="secondary" disabled={driversQuery.isError || !csvEnabled || !csvFile} onClick={() => {
            if (!csvFile) return;
            importMutation.mutate({ companyId, generation: actionGenerationRef.current, file: csvFile });
          }}>
            CSV Import
          </Button>
          {!driversQuery.isError && !csvEnabled ? <span className="text-[11px] text-amber-700">CSV fallback disabled for projected entity</span> : null}
        </div>
        {driversQuery.isError ? (
          <ListErrorState
            title="Couldn't load maintenance drivers"
            status={0}
            message={(driversQuery.error as Error)?.message}
            onRetry={() => void driversQuery.refetch()}
          />
        ) : (
          <ParityTable<MaintenanceDriverRow>
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            loading={driversQuery.isLoading}
            emptyText="No drivers found."
            storageKey="maint-master-data-drivers"
            exportFilename="maintenance-drivers"
            rowActions={rowActions}
            // MAINT-F3522: keep API search above; hide ParityTable toolbar Search
            suppressToolbarSearch
          />
        )}
      </div>

      <Modal variant="drawer" open={createOpen} onClose={() => setCreateOpen(false)} title="Create Driver">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" placeholder="First name" value={draft.first_name} onChange={(e) => setDraft((p) => ({ ...p, first_name: e.target.value }))} />
            <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" placeholder="Last name" value={draft.last_name} onChange={(e) => setDraft((p) => ({ ...p, last_name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" placeholder="Phone" value={draft.phone} onChange={(e) => setDraft((p) => ({ ...p, phone: e.target.value }))} />
            <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" placeholder="Email" value={draft.email} onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" placeholder="CDL number" value={draft.cdl_number} onChange={(e) => setDraft((p) => ({ ...p, cdl_number: e.target.value }))} />
            <StateSelect
              value={draft.cdl_state}
              onChange={(code) => setDraft((p) => ({ ...p, cdl_state: code }))}
              placeholder="CDL state"
              id="maintenance-create-driver-cdl-state"
            />
          </div>
          <textarea className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs" rows={3} placeholder="Notes" value={draft.notes} onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))} />
          <Button disabled={driversQuery.isError || !draft.first_name || !draft.last_name || !draft.phone || createMutation.isPending} onClick={() => createMutation.mutate({ companyId, generation: actionGenerationRef.current, draft: { ...draft } })}>
            Save
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit Driver">
        {editing ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" value={editing.first_name} onChange={(e) => setEditing((p) => (p ? { ...p, first_name: e.target.value } : p))} />
              <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" value={editing.last_name} onChange={(e) => setEditing((p) => (p ? { ...p, last_name: e.target.value } : p))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" value={editing.phone ?? ""} onChange={(e) => setEditing((p) => (p ? { ...p, phone: e.target.value } : p))} />
              <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" value={editing.email ?? ""} onChange={(e) => setEditing((p) => (p ? { ...p, email: e.target.value || null } : p))} />
            </div>
            <textarea className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs" rows={3} value={editing.notes ?? ""} onChange={(e) => setEditing((p) => (p ? { ...p, notes: e.target.value } : p))} />
            <Button onClick={() => updateMutation.mutate({ companyId, generation: actionGenerationRef.current, row: { ...editing } })} disabled={driversQuery.isError || updateMutation.isPending}>Save Changes</Button>
          </div>
        ) : null}
      </Modal>

      <VoidReasonModal
        open={Boolean(voiding)}
        title="Void Driver"
        entityRef={voiding ? entityLabel(`${voiding.first_name} ${voiding.last_name}`, voiding.id, "Driver") : undefined}
        minLength={1}
        postsReversingEntry={false}
        submitLabel="Void"
        onClose={() => setVoiding(null)}
        onSubmit={async (reason) => {
          if (!voiding || driversQuery.isError) return;
          await voidMutation.mutateAsync({ id: voiding.id, companyId, generation: actionGenerationRef.current, reason });
        }}
      />
    </div>
  );
}
