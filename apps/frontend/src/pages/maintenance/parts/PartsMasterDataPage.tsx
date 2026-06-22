import { useMemo, useState } from "react";
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
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import { useCompanyContext } from "../../../contexts/CompanyContext";

type PartDraft = {
  part_number: string;
  name: string;
  vendor_default: string;
  unit_cost: string;
  qty_on_hand: string;
  reorder_threshold: string;
  location: string;
};

const EMPTY_DRAFT: PartDraft = {
  part_number: "",
  name: "",
  vendor_default: "",
  unit_cost: "",
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

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["maintenance", "master-data", "parts", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["maintenance", "master-data", "parts-kpis", companyId] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createMaintenancePart(companyId, {
        part_number: draft.part_number,
        name: draft.name,
        vendor_default: draft.vendor_default || undefined,
        unit_cost: draft.unit_cost ? Number(draft.unit_cost) : undefined,
        qty_on_hand: Number(draft.qty_on_hand || "0"),
        reorder_threshold: Number(draft.reorder_threshold || "0"),
        location: draft.location || undefined,
      }),
    onSuccess: async () => {
      setCreateOpen(false);
      setDraft(EMPTY_DRAFT);
      await refresh();
      pushToast("Part created", "success");
    },
    onError: () => pushToast("Failed to create part", "error"),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error("No part selected");
      return updateMaintenancePart(editing.id, companyId, {
        part_number: editing.part_number,
        name: editing.name,
        vendor_default: editing.vendor_default,
        unit_cost: editing.unit_cost,
        qty_on_hand: editing.qty_on_hand,
        reorder_threshold: editing.reorder_threshold,
        location: editing.location,
      });
    },
    onSuccess: async () => {
      setEditing(null);
      await refresh();
      pushToast("Part updated", "success");
    },
    onError: () => pushToast("Failed to update part", "error"),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!csvFile) throw new Error("File required");
      return importMaintenanceParts(companyId, csvFile);
    },
    onSuccess: async (result) => {
      await refresh();
      setCsvFile(null);
      const inserted = String(result.inserted_rows ?? 0);
      const rolledBack = Boolean(result.rolled_back);
      pushToast(rolledBack ? `Import rolled back (${inserted} inserted)` : `Import completed (${inserted} inserted)`, rolledBack ? "error" : "success");
    },
    onError: () => pushToast("Parts CSV import failed", "error"),
  });

  const rows = useMemo(() => partsQuery.data?.rows ?? [], [partsQuery.data?.rows]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded border border-gray-200 bg-white p-3">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Maintenance Parts</h1>
          <p className="text-xs text-gray-600">Primary CSV bulk-load path with manual create/edit/void support.</p>
        </div>
        <div className="flex items-center gap-2">
          <input className="h-8 rounded border border-gray-300 px-2 text-xs" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search parts" />
          {/* ARCHIVE-not-DELETE (B25): prior header CTA "+ Create" — Sunset: 2026-09. Canonical: + Create Part. */}
          <Button size="sm" variant="secondary" onClick={() => setCreateOpen(true)}>
            + Create Part
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded border border-gray-200 bg-white px-3 py-2 text-xs">
          <div className="text-gray-500">Total Parts</div>
          <div className="text-sm font-semibold">{kpisQuery.data?.total_parts ?? 0}</div>
        </div>
        <div className="rounded border border-gray-200 bg-white px-3 py-2 text-xs">
          <div className="text-gray-500">Low Stock</div>
          <div className="text-sm font-semibold">{kpisQuery.data?.low_stock_count ?? 0}</div>
        </div>
        <div className="rounded border border-gray-200 bg-white px-3 py-2 text-xs">
          <div className="text-gray-500">Total Inventory Value</div>
          <div className="text-sm font-semibold">${Number(kpisQuery.data?.total_inventory_value ?? 0).toLocaleString()}</div>
        </div>
      </div>

      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="mb-3 flex items-center gap-2">
          <input type="file" accept=".csv,text/csv" onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)} className="text-xs" />
          <Button size="sm" variant="secondary" disabled={!csvFile} onClick={() => importMutation.mutate()}>
            CSV Import
          </Button>
          <a className="text-xs text-slate-600 underline" href={getMaintenancePartsTemplateUrl(companyId)} target="_blank" rel="noreferrer">
            Download template
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="px-2 py-2">Part #</th>
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">On Hand</th>
                <th className="px-2 py-2">Cost</th>
                <th className="px-2 py-2">Source</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100">
                  <td className="px-2 py-2 font-semibold">{row.part_number}</td>
                  <td className="px-2 py-2">{row.name}</td>
                  <td className="px-2 py-2">{row.qty_on_hand} (reorder {row.reorder_threshold})</td>
                  <td className="px-2 py-2">${Number(row.unit_cost ?? 0).toFixed(2)}</td>
                  <td className="px-2 py-2"><span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">{row.voided_at ? "Voided" : row.source === "csv" ? "CSV" : "Manual"}</span></td>
                  <td className="px-2 py-2">
                    <div className="flex gap-2">
                      <button type="button" className="text-slate-600 underline" onClick={() => setEditing(row)}>Edit</button>
                      <button
                        type="button"
                        className="text-red-600 underline"
                        onClick={async () => {
                          const reason = window.prompt("Void reason");
                          if (!reason) return;
                          await voidMaintenancePart(row.id, companyId, reason);
                          await refresh();
                        }}
                      >
                        Void
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td className="px-2 py-6 text-center text-gray-500" colSpan={6}>No parts found.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Part">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className="h-8 rounded border border-gray-300 px-2 text-xs" placeholder="Part number" value={draft.part_number} onChange={(e) => setDraft((p) => ({ ...p, part_number: e.target.value }))} />
            <input className="h-8 rounded border border-gray-300 px-2 text-xs" placeholder="Name" value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="h-8 rounded border border-gray-300 px-2 text-xs" placeholder="Vendor default" value={draft.vendor_default} onChange={(e) => setDraft((p) => ({ ...p, vendor_default: e.target.value }))} />
            <input className="h-8 rounded border border-gray-300 px-2 text-xs" placeholder="Unit cost" type="number" step="0.01" value={draft.unit_cost} onChange={(e) => setDraft((p) => ({ ...p, unit_cost: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="h-8 rounded border border-gray-300 px-2 text-xs" placeholder="Qty on hand" type="number" value={draft.qty_on_hand} onChange={(e) => setDraft((p) => ({ ...p, qty_on_hand: e.target.value }))} />
            <input className="h-8 rounded border border-gray-300 px-2 text-xs" placeholder="Reorder threshold" type="number" value={draft.reorder_threshold} onChange={(e) => setDraft((p) => ({ ...p, reorder_threshold: e.target.value }))} />
          </div>
          <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" placeholder="Location" value={draft.location} onChange={(e) => setDraft((p) => ({ ...p, location: e.target.value }))} />
          <Button disabled={!draft.part_number || !draft.name || createMutation.isPending} onClick={() => createMutation.mutate()}>
            Save
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit Part">
        {editing ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input className="h-8 rounded border border-gray-300 px-2 text-xs" value={editing.part_number} onChange={(e) => setEditing((p) => (p ? { ...p, part_number: e.target.value } : p))} />
              <input className="h-8 rounded border border-gray-300 px-2 text-xs" value={editing.name} onChange={(e) => setEditing((p) => (p ? { ...p, name: e.target.value } : p))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className="h-8 rounded border border-gray-300 px-2 text-xs" type="number" value={editing.qty_on_hand} onChange={(e) => setEditing((p) => (p ? { ...p, qty_on_hand: Number(e.target.value || 0) } : p))} />
              <input className="h-8 rounded border border-gray-300 px-2 text-xs" type="number" value={editing.reorder_threshold} onChange={(e) => setEditing((p) => (p ? { ...p, reorder_threshold: Number(e.target.value || 0) } : p))} />
            </div>
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>Save Changes</Button>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
