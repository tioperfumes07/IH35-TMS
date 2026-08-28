import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createMaintenancePart,
  getMaintenancePartsKpis,
  getMaintenancePartsTemplateUrl,
  importMaintenanceParts,
  listMaintenanceParts,
  type MaintenancePartRow,
  updateMaintenancePart,
  voidMaintenancePart,
} from "../../../api/maintenance";
import { VoidReasonModal } from "../../../components/accounting/VoidReasonModal";
import { Button } from "../../../components/Button";
import { Combobox } from "../../../components/Combobox";
import { ListErrorState } from "../../../components/ListErrorState";
import { Modal } from "../../../components/Modal";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { PageHeader } from "../../../components/forms/shared/PageHeader";
import { useToast } from "../../../components/Toast";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { formatQueryErrorDetail } from "../../../lib/tableError";
import { listAllVendors } from "../../../api/mdata";

type PartDraft = {
  part_number: string;
  name: string;
  vendor_default: string;
  unit_cost: number | null; // M-1: dollar number (backend /maintenance/parts unit_cost = numeric(10,2) DOLLARS)
  qty_on_hand: string;
  reorder_threshold: string;
  location: string;
};

const EMPTY_DRAFT: PartDraft = {
  part_number: "",
  name: "",
  vendor_default: "",
  unit_cost: null,
  qty_on_hand: "0",
  reorder_threshold: "0",
  location: "",
};

export function PartsMasterDataPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<PartDraft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<MaintenancePartRow | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [voiding, setVoiding] = useState<MaintenancePartRow | null>(null);
  const actionGenerationRef = useRef(0);

  const partsQuery = useQuery({
    queryKey: ["maintenance", "master-data", "parts", companyId, search],
    queryFn: () => listMaintenanceParts(companyId, { search }),
    enabled: Boolean(companyId),
  });
  const kpisQuery = useQuery({
    queryKey: ["maintenance", "master-data", "parts-kpis", companyId],
    queryFn: () => getMaintenancePartsKpis(companyId),
    enabled: Boolean(companyId),
  });
  // parts.create:vendor was ruled false-Required (vendor_default is a denormalized text label, not a
  // vendor_id FK — see docs/specs/scoreboard/modules/maintenance.required.json's "vendor" drop for this
  // leaf), so this suggests real roster names without turning the field into an FK picker.
  const vendorsQuery = useQuery({
    queryKey: ["maintenance", "master-data", "parts-vendor-suggestions", companyId],
    queryFn: () => listAllVendors({ operating_company_id: companyId }).then((r) => r.vendors),
    enabled: Boolean(companyId) && createOpen,
    staleTime: 120_000,
  });
  const vendorNameOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: Array<{ value: string; label: string }> = [];
    for (const v of vendorsQuery.data ?? []) {
      const name = v.name?.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      options.push({ value: name, label: name });
    }
    return options;
  }, [vendorsQuery.data]);

  const refresh = async (submittedCompanyId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["maintenance", "master-data", "parts", submittedCompanyId] }),
      queryClient.invalidateQueries({ queryKey: ["maintenance", "master-data", "parts-kpis", submittedCompanyId] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: (input: { companyId: string; generation: number; draft: PartDraft }) =>
      createMaintenancePart(input.companyId, {
        part_number: input.draft.part_number,
        name: input.draft.name,
        vendor_default: input.draft.vendor_default || undefined,
        unit_cost: input.draft.unit_cost ?? undefined,
        qty_on_hand: Number(input.draft.qty_on_hand || "0"),
        reorder_threshold: Number(input.draft.reorder_threshold || "0"),
        location: input.draft.location || undefined,
      }),
    onSuccess: async (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      setCreateOpen(false);
      setDraft(EMPTY_DRAFT);
      await refresh(input.companyId);
      pushToast("Part created", "success");
    },
    onError: (_error, input) => {
      if (input.generation === actionGenerationRef.current) pushToast("Failed to create part", "error");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: { companyId: string; generation: number; row: MaintenancePartRow }) =>
      updateMaintenancePart(input.row.id, input.companyId, {
        part_number: input.row.part_number,
        name: input.row.name,
        vendor_default: input.row.vendor_default,
        unit_cost: input.row.unit_cost,
        qty_on_hand: input.row.qty_on_hand,
        reorder_threshold: input.row.reorder_threshold,
        location: input.row.location,
      }),
    onSuccess: async (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      setEditing(null);
      await refresh(input.companyId);
      pushToast("Part updated", "success");
    },
    onError: (_error, input) => {
      if (input.generation === actionGenerationRef.current) pushToast("Failed to update part", "error");
    },
  });

  const importMutation = useMutation({
    mutationFn: (input: { companyId: string; generation: number; file: File }) =>
      importMaintenanceParts(input.companyId, input.file),
    onSuccess: async (result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      await refresh(input.companyId);
      setCsvFile(null);
      const inserted = String(result.inserted_rows ?? 0);
      const rolledBack = Boolean(result.rolled_back);
      pushToast(rolledBack ? `Import rolled back (${inserted} inserted)` : `Import completed (${inserted} inserted)`, rolledBack ? "error" : "success");
    },
    onError: (_error, input) => {
      if (input.generation === actionGenerationRef.current) pushToast("Parts CSV import failed", "error");
    },
  });

  const voidMutation = useMutation({
    mutationFn: (input: { id: string; companyId: string; generation: number; reason: string }) =>
      voidMaintenancePart(input.id, input.companyId, input.reason),
    onSuccess: async (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      setVoiding(null);
      await refresh(input.companyId);
      pushToast("Part voided", "success");
    },
    onError: (_error, input) => {
      if (input.generation === actionGenerationRef.current) pushToast("Failed to void part", "error");
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
    if (!partsQuery.isError) return;
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
  }, [partsQuery.isError]);

  const rows = useMemo(() => partsQuery.data?.rows ?? [], [partsQuery.data?.rows]);

  // Universal-list columns. Parts are NOT a linkable entity (no part-detail route), so there are no
  // record-cell links here — same honest call as the Parts Inventory tab (PR-E).
  const columns: Array<ParityColumn<MaintenancePartRow>> = [
    { key: "part_number", label: "Part #", sortable: true, cellClass: "font-semibold" },
    { key: "name", label: "Name", sortable: true },
    {
      key: "qty_on_hand",
      label: "On Hand",
      sortable: true,
      render: (row) => `${row.qty_on_hand} (reorder ${row.reorder_threshold})`,
    },
    { key: "unit_cost", label: "Cost", sortable: true, render: (row) => `$${Number(row.unit_cost ?? 0).toFixed(2)}` },
    {
      key: "source",
      label: "Source",
      sortable: true,
      render: (row) => (
        <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
          {row.voided_at ? "Voided" : row.source === "csv" ? "CSV" : "Manual"}
        </span>
      ),
    },
  ];

  const rowActions = (row: MaintenancePartRow) => (
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
        title="Maintenance Parts"
        subtitle="Primary CSV bulk-load path with manual create/edit/void support."
        breadcrumb={[{ label: "Maintenance" }, { label: "Parts" }]}
        backHref="/maintenance"
        actions={
          <div className="flex items-center gap-2">
            {/* MAINT-F3518: server-bound parts search — keep; ParityTable toolbar Search suppressed */}
            <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search parts" />
            {/* ARCHIVE-not-DELETE (B25): prior header CTA "+ Create" — Sunset: 2026-09. Canonical: + Create Part. */}
            <Button size="sm" variant="secondary" disabled={partsQuery.isError} onClick={() => setCreateOpen(true)}>
              + Create Part
            </Button>
          </div>
        }
      />

      {kpisQuery.isError ? (
        <ListErrorState
          title="Couldn't load parts inventory summary"
          {...formatQueryErrorDetail(kpisQuery.error)}
          onRetry={() => void kpisQuery.refetch()}
        />
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-xs">
            <div className="text-gray-500">Total Parts</div>
            <div className="text-sm font-semibold">{kpisQuery.data?.total_parts ?? 0}</div>
          </div>
          <div className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-xs">
            <div className="text-gray-500">Low Stock</div>
            <div className="text-sm font-semibold">{kpisQuery.data?.low_stock_count ?? 0}</div>
          </div>
          <div className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-xs">
            <div className="text-gray-500">Total Inventory Value</div>
            <div className="text-sm font-semibold">${Number(kpisQuery.data?.total_inventory_value ?? 0).toLocaleString()}</div>
          </div>
        </div>
      )}

      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="mb-3 flex items-center gap-2">
          <input type="file" accept=".csv,text/csv" disabled={partsQuery.isError} onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)} className="text-xs" />
          <Button size="sm" variant="secondary" disabled={partsQuery.isError || !csvFile} onClick={() => {
            if (!csvFile) return;
            importMutation.mutate({ companyId, generation: actionGenerationRef.current, file: csvFile });
          }}>
            CSV Import
          </Button>
          <a className="text-xs text-slate-600 underline" href={getMaintenancePartsTemplateUrl(companyId)} target="_blank" rel="noreferrer">
            Download template
          </a>
        </div>
        {partsQuery.isError ? (
          <ListErrorState
            title="Couldn't load maintenance parts"
            {...formatQueryErrorDetail(partsQuery.error)}
            onRetry={() => void partsQuery.refetch()}
          />
        ) : (
          <ParityTable<MaintenancePartRow>
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            loading={partsQuery.isLoading}
            emptyText="No parts found."
            storageKey="maint-master-data-parts"
            exportFilename="maintenance-parts"
            rowActions={rowActions}
            // MAINT-F3518: keep API search above; hide ParityTable toolbar Search
            suppressToolbarSearch
          />
        )}
      </div>

      <Modal variant="drawer" open={createOpen} onClose={() => setCreateOpen(false)} title="Create Part">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" placeholder="Part number" value={draft.part_number} onChange={(e) => setDraft((p) => ({ ...p, part_number: e.target.value }))} />
            <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" placeholder="Name" value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Combobox
              options={vendorNameOptions}
              value={draft.vendor_default || null}
              onChange={(next) => setDraft((p) => ({ ...p, vendor_default: next ?? "" }))}
              placeholder="Vendor default"
              loading={vendorsQuery.isLoading}
              allowClear
              allowAddNew={{ label: "Use", onAdd: (query) => setDraft((p) => ({ ...p, vendor_default: query })) }}
              dataTestId="maintenance-create-part-vendor-default"
            />
            <MoneyInput valueDollars={draft.unit_cost} onChangeDollars={(d) => setDraft((p) => ({ ...p, unit_cost: d }))} ariaLabel="Unit cost" placeholder="Unit cost" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" placeholder="Qty on hand" type="number" value={draft.qty_on_hand} onChange={(e) => setDraft((p) => ({ ...p, qty_on_hand: e.target.value }))} />
            <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" placeholder="Reorder threshold" type="number" value={draft.reorder_threshold} onChange={(e) => setDraft((p) => ({ ...p, reorder_threshold: e.target.value }))} />
          </div>
          <input className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" placeholder="Location" value={draft.location} onChange={(e) => setDraft((p) => ({ ...p, location: e.target.value }))} />
          <Button disabled={partsQuery.isError || !draft.part_number || !draft.name || createMutation.isPending} onClick={() => createMutation.mutate({ companyId, generation: actionGenerationRef.current, draft: { ...draft } })}>
            Save
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit Part">
        {editing ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" value={editing.part_number} onChange={(e) => setEditing((p) => (p ? { ...p, part_number: e.target.value } : p))} />
              <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" value={editing.name} onChange={(e) => setEditing((p) => (p ? { ...p, name: e.target.value } : p))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" type="number" value={editing.qty_on_hand} onChange={(e) => setEditing((p) => (p ? { ...p, qty_on_hand: Number(e.target.value || 0) } : p))} />
              <input className="h-8 rounded-sm border border-gray-300 px-2 text-xs" type="number" value={editing.reorder_threshold} onChange={(e) => setEditing((p) => (p ? { ...p, reorder_threshold: Number(e.target.value || 0) } : p))} />
            </div>
            <Button onClick={() => updateMutation.mutate({ companyId, generation: actionGenerationRef.current, row: { ...editing } })} disabled={partsQuery.isError || updateMutation.isPending}>Save Changes</Button>
          </div>
        ) : null}
      </Modal>

      <VoidReasonModal
        open={Boolean(voiding)}
        title="Void Part"
        entityRef={voiding ? `${voiding.part_number} — ${voiding.name}` : undefined}
        minLength={1}
        postsReversingEntry={false}
        submitLabel="Void"
        onClose={() => setVoiding(null)}
        onSubmit={async (reason) => {
          if (!voiding || partsQuery.isError) return;
          await voidMutation.mutateAsync({ id: voiding.id, companyId, generation: actionGenerationRef.current, reason });
        }}
      />
    </div>
  );
}
