import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archiveMaintenanceVendor,
  createMaintenanceVendor,
  getMaintenanceVendorsTemplateUrl,
  importMaintenanceVendors,
  listMaintenanceVendors,
  type MaintenanceVendorRow,
  updateMaintenanceVendor,
} from "../../../api/maintenance";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { useToast } from "../../../components/Toast";
import { useCompanyContext } from "../../../contexts/CompanyContext";

type VendorDraft = {
  code: string;
  display_name: string;
  description: string;
  type: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  payment_terms: string;
  notes: string;
};

const EMPTY_DRAFT: VendorDraft = {
  code: "",
  display_name: "",
  description: "",
  type: "",
  contact_email: "",
  contact_phone: "",
  address: "",
  payment_terms: "",
  notes: "",
};

export function VendorsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<VendorDraft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<MaintenanceVendorRow | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const listQ = useQuery({
    queryKey: ["maintenance", "vendors", companyId, search],
    queryFn: () => listMaintenanceVendors(companyId, { search }),
    enabled: Boolean(companyId),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["maintenance", "vendors", companyId] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createMaintenanceVendor({
        operating_company_id: companyId,
        code: draft.code || undefined,
        display_name: draft.display_name,
        description: draft.description || undefined,
        type: draft.type || undefined,
        contact_email: draft.contact_email || undefined,
        contact_phone: draft.contact_phone || undefined,
        address: draft.address || undefined,
        payment_terms: draft.payment_terms || undefined,
        notes: draft.notes || undefined,
      }),
    onSuccess: async () => {
      setCreateOpen(false);
      setDraft(EMPTY_DRAFT);
      await refresh();
      pushToast("Vendor created", "success");
    },
    onError: () => pushToast("Failed to create vendor", "error"),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error("No vendor selected");
      return updateMaintenanceVendor(editing.id, {
        operating_company_id: companyId,
        display_name: editing.display_name,
        description: editing.description ?? undefined,
        type: editing.type ?? undefined,
        contact_email: editing.contact_email ?? undefined,
        contact_phone: editing.contact_phone ?? undefined,
        address: editing.address ?? undefined,
        payment_terms: editing.payment_terms ?? undefined,
        notes: editing.notes ?? undefined,
      });
    },
    onSuccess: async () => {
      setEditing(null);
      await refresh();
      pushToast("Vendor updated", "success");
    },
    onError: () => pushToast("Failed to update vendor", "error"),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!csvFile) throw new Error("File required");
      return importMaintenanceVendors(companyId, csvFile);
    },
    onSuccess: async (result) => {
      await refresh();
      setCsvFile(null);
      pushToast(`Vendor import completed (${String(result.inserted_rows ?? 0)} rows)`, "success");
    },
    onError: () => pushToast("Vendor CSV import failed", "error"),
  });

  const rows = useMemo(() => listQ.data?.rows ?? [], [listQ.data?.rows]);
  const csvEnabled = listQ.data?.csv_import_enabled ?? false;

  // Universal-list columns. Vendor links to the maintenance vendor detail.
  const columns: Array<ParityColumn<MaintenanceVendorRow>> = [
    {
      key: "display_name",
      label: "Vendor",
      sortable: true,
      render: (row) => (
        <Link to={`/maintenance/vendors/${row.id}`} className="font-semibold text-slate-700 hover:underline">
          {String(row.display_name ?? row.name ?? "—")}
        </Link>
      ),
    },
    { key: "code", label: "Code", sortable: true, render: (row) => String(row.code ?? "—") },
    { key: "contact_email", label: "Email", render: (row) => String(row.contact_email ?? "—") },
    { key: "contact_phone", label: "Phone", render: (row) => String(row.contact_phone ?? "—") },
    { key: "is_active", label: "Status", sortable: true, render: (row) => (row.is_active ? "Active" : "Archived") },
  ];

  const rowActions = (row: MaintenanceVendorRow) => (
    <div className="flex gap-2">
      <button type="button" className="text-slate-600 underline" onClick={() => setEditing(row)}>
        Edit
      </button>
      <button
        type="button"
        className="text-red-600 underline"
        disabled={!row.is_active}
        onClick={async () => {
          const reason = window.prompt("Archive reason");
          if (!reason) return;
          await archiveMaintenanceVendor(row.id, companyId, reason);
          await refresh();
          pushToast("Vendor archived", "success");
        }}
      >
        Archive
      </button>
    </div>
  );

  return (
    <div className="space-y-3" data-testid="maint-vendors-page">
      <div className="flex items-center justify-between rounded border border-gray-200 bg-white p-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Maintenance Vendors</h2>
          <p className="text-xs text-gray-600">
            Canonical vendor master linked to{" "}
            <Link className="text-slate-600 underline" to="/lists/maintenance/vendors">
              Lists & Catalogs
            </Link>
            .
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="h-8 rounded border border-gray-300 px-2 text-xs"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search vendors"
          />
          <Button size="sm" variant="secondary" onClick={() => setCreateOpen(true)}>
            + Create Vendor
          </Button>
        </div>
      </div>

      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input type="file" accept=".csv,text/csv" disabled={!csvEnabled} onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)} className="text-xs" />
          <Button size="sm" variant="secondary" disabled={!csvEnabled || !csvFile} onClick={() => importMutation.mutate()}>
            CSV Import
          </Button>
          <a className="text-xs text-slate-600 underline" href={getMaintenanceVendorsTemplateUrl(companyId)}>
            Download template
          </a>
        </div>
        <ParityTable<MaintenanceVendorRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => String(row.id)}
          loading={listQ.isLoading}
          emptyText="No vendors available."
          storageKey="maint-master-data-vendors"
          exportFilename="maintenance-vendors"
          rowActions={rowActions}
        />
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Vendor">
        <div className="space-y-2">
          <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" placeholder="Display name" value={draft.display_name} onChange={(e) => setDraft((p) => ({ ...p, display_name: e.target.value }))} />
          <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" placeholder="Code (optional)" value={draft.code} onChange={(e) => setDraft((p) => ({ ...p, code: e.target.value.toUpperCase() }))} />
          <div className="grid grid-cols-2 gap-2">
            <input className="h-8 rounded border border-gray-300 px-2 text-xs" placeholder="Email" value={draft.contact_email} onChange={(e) => setDraft((p) => ({ ...p, contact_email: e.target.value }))} />
            <input className="h-8 rounded border border-gray-300 px-2 text-xs" placeholder="Phone" value={draft.contact_phone} onChange={(e) => setDraft((p) => ({ ...p, contact_phone: e.target.value }))} />
          </div>
          <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" placeholder="Type" value={draft.type} onChange={(e) => setDraft((p) => ({ ...p, type: e.target.value }))} />
          <textarea className="w-full rounded border border-gray-300 px-2 py-1 text-xs" rows={3} placeholder="Notes" value={draft.notes} onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))} />
          <Button disabled={!draft.display_name || createMutation.isPending} onClick={() => createMutation.mutate()}>
            Save
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit Vendor">
        {editing ? (
          <div className="space-y-2">
            <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" value={editing.display_name} onChange={(e) => setEditing((p) => (p ? { ...p, display_name: e.target.value } : p))} />
            <div className="grid grid-cols-2 gap-2">
              <input className="h-8 rounded border border-gray-300 px-2 text-xs" value={editing.contact_email ?? ""} onChange={(e) => setEditing((p) => (p ? { ...p, contact_email: e.target.value || null } : p))} />
              <input className="h-8 rounded border border-gray-300 px-2 text-xs" value={editing.contact_phone ?? ""} onChange={(e) => setEditing((p) => (p ? { ...p, contact_phone: e.target.value || null } : p))} />
            </div>
            <textarea className="w-full rounded border border-gray-300 px-2 py-1 text-xs" rows={3} value={editing.notes ?? ""} onChange={(e) => setEditing((p) => (p ? { ...p, notes: e.target.value || null } : p))} />
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
              Save Changes
            </Button>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
