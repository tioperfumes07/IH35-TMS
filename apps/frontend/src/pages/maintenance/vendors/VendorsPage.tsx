import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EntityLink } from "../../../components/shared/EntityLink";
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
import { listVendors } from "../../../api/mdata";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { VoidReasonModal } from "../../../components/accounting/VoidReasonModal";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";
import { useToast } from "../../../components/Toast";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { capNotice, listCapInfo } from "../../../lib/list-cap";
import { entityLabel } from "../../../lib/entity-label";

// Named so the fetch and the CLS-SILENT-CAP truncation check read the SAME numbers and cannot drift.
// Browse cap is the route max; the search cap is deliberately smaller because a search should narrow.
const AP_VENDOR_BROWSE_CAP = 1000;
const AP_VENDOR_SEARCH_CAP = 200;

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
  mdata_vendor_id: string | null;
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
  mdata_vendor_id: null,
};

export function VendorsPage() {
  const [searchParams] = useSearchParams();
  const highlightedVendorId = searchParams.get("maintenance_vendor_id")?.trim() ?? "";
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<VendorDraft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<MaintenanceVendorRow | null>(null);
  // NO-NATIVE-DIALOGS-U6 — window.prompt freezes Live Chrome browser automation; VoidReasonModal
  // (in-app required-reason shell) replaces it, same archive-reason contract.
  const [archiveTarget, setArchiveTarget] = useState<MaintenanceVendorRow | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  // SAF-B29 / LST-PICKER-01: AP link must server-search — silent limit:1000 dropped vendors past page 1.
  const [apVendorSearch, setApVendorSearch] = useState("");

  const listQ = useQuery({
    queryKey: ["maintenance", "vendors", companyId, search],
    queryFn: () => listMaintenanceVendors(companyId, { search }),
    enabled: Boolean(companyId),
  });

  const apVendorsQ = useQuery({
    queryKey: ["mdata", "vendors", "maint-vendor-link", companyId, apVendorSearch],
    queryFn: () =>
      listVendors({
        operating_company_id: companyId,
        status: "active",
        limit: apVendorSearch ? AP_VENDOR_SEARCH_CAP : AP_VENDOR_BROWSE_CAP,
        search: apVendorSearch || undefined,
      }),
    enabled: Boolean(companyId) && (createOpen || Boolean(editing)),
  });

  const apVendorOptions = useMemo(
    () =>
      (apVendorsQ.data?.vendors ?? [])
        .map((vendor) => ({ value: vendor.id, label: entityLabel(vendor.name, vendor.id, "Vendor") }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [apVendorsQ.data?.vendors]
  );

  // CLS-SILENT-CAP. The comment above already records that `limit: 1000` "dropped vendors past page 1",
  // and server-search was added as the mitigation — but that only helps a user who already suspects the
  // vendor is missing. Unsearched, this picker loads 1,000 of 2,836 active vendors on prod TODAY and
  // renders no indication whatsoever, so a vendor in the last 1,836 looks like it does not exist.
  // listVendors returns the server's real `total`, so the truncation here is EXACT, not inferred.
  const apVendorCap = useMemo(
    () =>
      listCapInfo(
        apVendorsQ.data?.vendors?.length ?? 0,
        apVendorSearch ? AP_VENDOR_SEARCH_CAP : AP_VENDOR_BROWSE_CAP,
        apVendorsQ.data?.total ?? null,
      ),
    [apVendorsQ.data, apVendorSearch]
  );
  const apVendorCapNotice = capNotice(apVendorCap, "vendors");

  const apVendorLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const vendor of apVendorsQ.data?.vendors ?? []) {
      map.set(vendor.id, entityLabel(vendor.name, vendor.id, "Vendor"));
    }
    return map;
  }, [apVendorsQ.data?.vendors]);

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
        mdata_vendor_id: draft.mdata_vendor_id,
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
        mdata_vendor_id: editing.mdata_vendor_id,
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
        <EntityLink
          kind="maintenance_vendor"
          id={row.id}
          label={String(row.display_name ?? row.name ?? "—")}
          className="font-semibold text-slate-700 hover:underline"
        />
      ),
    },
    { key: "code", label: "Code", sortable: true, render: (row) => String(row.code ?? "—") },
    {
      key: "mdata_vendor_id",
      label: "AP Vendor",
      render: (row) =>
        row.mdata_vendor_id ? (
          <EntityLink
            kind="vendor"
            id={row.mdata_vendor_id}
            label={entityLabel(apVendorLabelById.get(row.mdata_vendor_id), row.mdata_vendor_id, "Vendor")}
            className="text-slate-600 underline"
            data-testid="maintenance-vendors-ap-vendor-link"
          />
        ) : (
          "—"
        ),
    },
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
        onClick={() => setArchiveTarget(row)}
      >
        Archive
      </button>
    </div>
  );

  return (
    <div className="space-y-3" data-testid="maint-vendors-page">
      <div className="flex items-center justify-between rounded-sm border border-gray-200 bg-white p-3">
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
          {/* MAINT-F3526: server-bound vendor search — keep; ParityTable toolbar Search suppressed */}
          <input
            className="h-8 rounded-sm border border-gray-300 px-2 text-xs"
            aria-label="Search vendors"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search vendors"
          />
          <Button size="sm" variant="secondary" onClick={() => setCreateOpen(true)}>
            + Create Vendor
          </Button>
        </div>
      </div>

      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input type="file" accept=".csv,text/csv" disabled={!csvEnabled} onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)} className="text-xs" />
          <Button size="sm" variant="secondary" disabled={!csvEnabled || !csvFile} onClick={() => importMutation.mutate()}>
            CSV Import
          </Button>
          <a className="text-xs text-slate-600 underline" href={getMaintenanceVendorsTemplateUrl(companyId)}>
            Download template
          </a>
        </div>
        {/* CLS-LIST-ERROR-STATE-UNGUARDED: a failed query fell through to the empty state — an outage presenting as a carrier with no
          maintenance vendors on file. */}
        {listQ.isError ? (
          <ListErrorState
            title="Couldn't load maintenance vendors"
            status={0}
            message={(listQ.error as Error)?.message}
            onRetry={() => void listQ.refetch()}
          />
        ) : (
        <ParityTable<MaintenanceVendorRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => String(row.id)}
          rowClassName={(row) => highlightedVendorId && row.id === highlightedVendorId ? "bg-slate-100 ring-1 ring-slate-400" : ""}
          loading={listQ.isLoading}
          emptyText="No vendors available."
          storageKey="maint-master-data-vendors"
          exportFilename="maintenance-vendors"
          rowActions={rowActions}
          // MAINT-F3526: keep API search above; hide ParityTable toolbar Search
          suppressToolbarSearch
        />
        )}
      </div>

      <Modal variant="drawer" open={createOpen} onClose={() => setCreateOpen(false)} title="Create Vendor">
        <div className="space-y-2">
          <input className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" placeholder="Display name" value={draft.display_name} onChange={(e) => setDraft((p) => ({ ...p, display_name: e.target.value }))} />
          <input className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" placeholder="Code (optional)" value={draft.code} onChange={(e) => setDraft((p) => ({ ...p, code: e.target.value.toUpperCase() }))} />
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-gray-600">A/P vendor</label>
            {/* CLS-SILENT-CAP: say so when the picker is not showing every vendor. */}
            {apVendorCapNotice ? (
              <p className="text-[10px] text-slate-700" data-testid="ap-vendor-cap-notice">
                {apVendorCapNotice}
              </p>
            ) : null}
            <ReferenceSelect
              options={apVendorOptions}
              value={draft.mdata_vendor_id}
              placeholder={apVendorsQ.isLoading ? "Loading AP vendors…" : "Link to AP vendor (optional)"}
              onChange={(value) => setDraft((p) => ({ ...p, mdata_vendor_id: value }))}
              createKind="vendor"
              operatingCompanyId={companyId}
              onSearch={setApVendorSearch}
              loading={apVendorsQ.isLoading}
              onOptionCreated={(opt) => {
                void queryClient.invalidateQueries({ queryKey: ["mdata", "vendors", "maint-vendor-link", companyId] });
                setDraft((p) => ({ ...p, mdata_vendor_id: opt.value }));
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" placeholder="Email" value={draft.contact_email} onChange={(e) => setDraft((p) => ({ ...p, contact_email: e.target.value }))} />
            <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" placeholder="Phone" value={draft.contact_phone} onChange={(e) => setDraft((p) => ({ ...p, contact_phone: e.target.value }))} />
          </div>
          <input className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" placeholder="Type" value={draft.type} onChange={(e) => setDraft((p) => ({ ...p, type: e.target.value }))} />
          <textarea className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs" rows={3} placeholder="Notes" value={draft.notes} onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))} />
          <Button disabled={!draft.display_name || createMutation.isPending} onClick={() => createMutation.mutate()}>
            Save
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit Vendor">
        {editing ? (
          <div className="space-y-2">
            <input className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={editing.display_name} onChange={(e) => setEditing((p) => (p ? { ...p, display_name: e.target.value } : p))} />
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-gray-600">A/P vendor</label>
            {/* CLS-SILENT-CAP: say so when the picker is not showing every vendor. */}
            {apVendorCapNotice ? (
              <p className="text-[10px] text-slate-700" data-testid="ap-vendor-cap-notice">
                {apVendorCapNotice}
              </p>
            ) : null}
              <ReferenceSelect
                options={apVendorOptions}
                value={editing.mdata_vendor_id}
                placeholder={apVendorsQ.isLoading ? "Loading AP vendors…" : "Link to AP vendor (optional)"}
                onChange={(value) => setEditing((p) => (p ? { ...p, mdata_vendor_id: value } : p))}
                createKind="vendor"
                operatingCompanyId={companyId}
                onSearch={setApVendorSearch}
                loading={apVendorsQ.isLoading}
                onOptionCreated={(opt) => {
                  void queryClient.invalidateQueries({ queryKey: ["mdata", "vendors", "maint-vendor-link", companyId] });
                  setEditing((p) => (p ? { ...p, mdata_vendor_id: opt.value } : p));
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" value={editing.contact_email ?? ""} onChange={(e) => setEditing((p) => (p ? { ...p, contact_email: e.target.value || null } : p))} />
              <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" value={editing.contact_phone ?? ""} onChange={(e) => setEditing((p) => (p ? { ...p, contact_phone: e.target.value || null } : p))} />
            </div>
            <textarea className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs" rows={3} value={editing.notes ?? ""} onChange={(e) => setEditing((p) => (p ? { ...p, notes: e.target.value || null } : p))} />
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
              Save Changes
            </Button>
          </div>
        ) : null}
      </Modal>
      <VoidReasonModal
        open={Boolean(archiveTarget)}
        title="Archive vendor"
        entityRef={archiveTarget?.display_name ?? undefined}
        minLength={1}
        postsReversingEntry={false}
        submitLabel="Archive"
        onClose={() => setArchiveTarget(null)}
        onSubmit={async (reason) => {
          if (!archiveTarget) return;
          await archiveMaintenanceVendor(archiveTarget.id, companyId, reason);
          await refresh();
          pushToast("Vendor archived", "success");
        }}
      />
    </div>
  );
}
