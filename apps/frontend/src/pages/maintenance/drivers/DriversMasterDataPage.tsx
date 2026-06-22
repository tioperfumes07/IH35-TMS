import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createMaintenanceDriver,
  importMaintenanceDrivers,
  listMaintenanceDrivers,
  type MaintenanceDriverRow,
  updateMaintenanceDriver,
  voidMaintenanceDriver,
} from "../../../api/maintenance";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import { useCompanyContext } from "../../../contexts/CompanyContext";

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

  const driversQuery = useQuery({
    queryKey: ["maintenance", "master-data", "drivers", companyId, search],
    queryFn: () => listMaintenanceDrivers(companyId, { search }),
    enabled: Boolean(companyId),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["maintenance", "master-data", "drivers", companyId] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createMaintenanceDriver(companyId, {
        first_name: draft.first_name,
        last_name: draft.last_name,
        phone: draft.phone,
        email: draft.email || undefined,
        cdl_number: draft.cdl_number || undefined,
        cdl_state: draft.cdl_state || undefined,
        status: draft.status,
        notes: draft.notes || undefined,
      }),
    onSuccess: async () => {
      setCreateOpen(false);
      setDraft(EMPTY_DRAFT);
      await refresh();
      pushToast("Driver created", "success");
    },
    onError: () => pushToast("Failed to create driver", "error"),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error("No driver selected");
      return updateMaintenanceDriver(editing.id, companyId, {
        first_name: editing.first_name,
        last_name: editing.last_name,
        phone: editing.phone,
        email: editing.email,
        cdl_number: editing.cdl_number,
        cdl_state: editing.cdl_state,
        status: editing.status as DriverDraft["status"],
        notes: editing.notes,
      });
    },
    onSuccess: async () => {
      setEditing(null);
      await refresh();
      pushToast("Driver updated", "success");
    },
    onError: () => pushToast("Failed to update driver", "error"),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!csvFile) throw new Error("File required");
      return importMaintenanceDrivers(companyId, csvFile);
    },
    onSuccess: async (result) => {
      await refresh();
      setCsvFile(null);
      pushToast(`Driver import completed (${String(result.inserted_rows ?? 0)} inserted)`, "success");
    },
    onError: () => pushToast("Driver CSV import failed", "error"),
  });

  const rows = useMemo(() => driversQuery.data?.rows ?? [], [driversQuery.data?.rows]);
  const csvEnabled = driversQuery.data?.csv_import_enabled ?? false;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded border border-gray-200 bg-white p-3">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Maintenance Drivers</h1>
          <p className="text-xs text-gray-600">Manage projected drivers with manual create/edit/void controls.</p>
        </div>
        <div className="flex items-center gap-2">
          <input className="h-8 rounded border border-gray-300 px-2 text-xs" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search drivers" />
          <Button size="sm" variant="secondary" onClick={() => setCreateOpen(true)}>+ Create</Button>
        </div>
      </div>

      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="mb-3 flex items-center gap-2">
          <input type="file" accept=".csv,text/csv" disabled={!csvEnabled} onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)} className="text-xs" />
          <Button size="sm" variant="secondary" disabled={!csvEnabled || !csvFile} onClick={() => importMutation.mutate()}>
            CSV Import
          </Button>
          {!csvEnabled ? <span className="text-[11px] text-amber-700">CSV fallback disabled for projected entity</span> : null}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="px-2 py-2">Driver</th>
                <th className="px-2 py-2">Contact</th>
                <th className="px-2 py-2">CDL</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Source</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100">
                  <td className="px-2 py-2 font-semibold">{row.first_name} {row.last_name}</td>
                  <td className="px-2 py-2">{row.phone}<br />{row.email ?? "—"}</td>
                  <td className="px-2 py-2">{row.cdl_number ?? "—"} {row.cdl_state ? `(${row.cdl_state})` : ""}</td>
                  <td className="px-2 py-2">{row.status}</td>
                  <td className="px-2 py-2"><span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">{row.source}</span></td>
                  <td className="px-2 py-2">
                    <div className="flex gap-2">
                      <button type="button" className="text-slate-600 underline" onClick={() => setEditing(row)}>Edit</button>
                      <button
                        type="button"
                        className="text-red-600 underline"
                        onClick={async () => {
                          const reason = window.prompt("Void reason");
                          if (!reason) return;
                          await voidMaintenanceDriver(row.id, companyId, reason);
                          await refresh();
                        }}
                      >
                        Void
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td className="px-2 py-6 text-center text-gray-500" colSpan={6}>No drivers found.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Driver">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className="h-8 rounded border border-gray-300 px-2 text-xs" placeholder="First name" value={draft.first_name} onChange={(e) => setDraft((p) => ({ ...p, first_name: e.target.value }))} />
            <input className="h-8 rounded border border-gray-300 px-2 text-xs" placeholder="Last name" value={draft.last_name} onChange={(e) => setDraft((p) => ({ ...p, last_name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="h-8 rounded border border-gray-300 px-2 text-xs" placeholder="Phone" value={draft.phone} onChange={(e) => setDraft((p) => ({ ...p, phone: e.target.value }))} />
            <input className="h-8 rounded border border-gray-300 px-2 text-xs" placeholder="Email" value={draft.email} onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="h-8 rounded border border-gray-300 px-2 text-xs" placeholder="CDL number" value={draft.cdl_number} onChange={(e) => setDraft((p) => ({ ...p, cdl_number: e.target.value }))} />
            <input className="h-8 rounded border border-gray-300 px-2 text-xs" placeholder="CDL state" value={draft.cdl_state} onChange={(e) => setDraft((p) => ({ ...p, cdl_state: e.target.value }))} />
          </div>
          <textarea className="w-full rounded border border-gray-300 px-2 py-1 text-xs" rows={3} placeholder="Notes" value={draft.notes} onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))} />
          <Button disabled={!draft.first_name || !draft.last_name || !draft.phone || createMutation.isPending} onClick={() => createMutation.mutate()}>
            Save
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit Driver">
        {editing ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input className="h-8 rounded border border-gray-300 px-2 text-xs" value={editing.first_name} onChange={(e) => setEditing((p) => (p ? { ...p, first_name: e.target.value } : p))} />
              <input className="h-8 rounded border border-gray-300 px-2 text-xs" value={editing.last_name} onChange={(e) => setEditing((p) => (p ? { ...p, last_name: e.target.value } : p))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className="h-8 rounded border border-gray-300 px-2 text-xs" value={editing.phone ?? ""} onChange={(e) => setEditing((p) => (p ? { ...p, phone: e.target.value } : p))} />
              <input className="h-8 rounded border border-gray-300 px-2 text-xs" value={editing.email ?? ""} onChange={(e) => setEditing((p) => (p ? { ...p, email: e.target.value || null } : p))} />
            </div>
            <textarea className="w-full rounded border border-gray-300 px-2 py-1 text-xs" rows={3} value={editing.notes ?? ""} onChange={(e) => setEditing((p) => (p ? { ...p, notes: e.target.value } : p))} />
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>Save Changes</Button>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
