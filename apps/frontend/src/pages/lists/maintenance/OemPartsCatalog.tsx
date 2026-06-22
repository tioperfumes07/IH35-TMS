import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  OEM_PART_CATEGORIES,
  oemPartsCatalogClient,
  type OemPartCreateBody,
  type OemPartRow,
} from "../../../api/lists-oem-parts";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { ListsSubNav } from "../ListsSubNav";

function formatCost(value: string | null) {
  if (!value) return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return `$${num.toFixed(2)}`;
}

function OemPartsCreateModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<OemPartCreateBody>({
    brand: "",
    part_name: "",
    category: "filters",
    oem_part_number: "",
    default_supplier: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      await oemPartsCatalogClient.create({
        ...form,
        oem_part_number: form.oem_part_number?.trim() || null,
        default_supplier: form.default_supplier?.trim() || null,
      });
      setForm({ brand: "", part_name: "", category: "filters", oem_part_number: "", default_supplier: "" });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create OEM part template");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create OEM Part Template">
      <div className="space-y-3">
        <label className="block text-sm">
          Brand
          <input
            value={form.brand}
            onChange={(event) => setForm((prev) => ({ ...prev, brand: event.target.value }))}
            className="mt-1 h-9 w-full rounded border border-gray-300 px-2"
          />
        </label>
        <label className="block text-sm">
          OEM Part #
          <input
            value={form.oem_part_number ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, oem_part_number: event.target.value }))}
            className="mt-1 h-9 w-full rounded border border-gray-300 px-2"
          />
        </label>
        <label className="block text-sm">
          Name
          <input
            value={form.part_name}
            onChange={(event) => setForm((prev) => ({ ...prev, part_name: event.target.value }))}
            className="mt-1 h-9 w-full rounded border border-gray-300 px-2"
          />
        </label>
        <label className="block text-sm">
          Category
          <SelectCombobox
            value={form.category}
            onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
            className="mt-1 h-9 w-full rounded border border-gray-300 px-2"
          >
            {OEM_PART_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <label className="block text-sm">
          Default Supplier
          <input
            value={form.default_supplier ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, default_supplier: event.target.value }))}
            className="mt-1 h-9 w-full rounded border border-gray-300 px-2"
          />
        </label>
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            + Create
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function OemPartsCatalog() {
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [fleetOnly, setFleetOnly] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const query = useQuery({
    queryKey: ["lists", "oem-parts", search, brandFilter, categoryFilter, fleetOnly],
    queryFn: () =>
      oemPartsCatalogClient.list({
        q: search || undefined,
        brand: brandFilter || undefined,
        category: categoryFilter || undefined,
        fleet_only: fleetOnly,
      }),
  });

  const brandsQuery = useQuery({
    queryKey: ["lists", "oem-parts", "brands"],
    queryFn: () => oemPartsCatalogClient.brands(),
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total_count ?? 0;
  const brandCount = query.data?.brand_count ?? 0;
  const fleetCount = query.data?.fleet_count ?? 0;

  const brandOptions = useMemo(() => {
    const fromApi = brandsQuery.data?.rows.map((row) => row.brand) ?? [];
    return [...new Set(fromApi)].sort();
  }, [brandsQuery.data?.rows]);

  const emptyText = useMemo(() => {
    if (query.isLoading) return "Loading OEM part templates...";
    if (rows.length > 0) return "";
    return "No OEM part templates found.";
  }, [query.isLoading, rows.length]);

  return (
    <div className="space-y-3">
      <ListsSubNav />
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={["Lists & Catalogs", "Maintenance", "OEM Parts Reference"]}
        title="OEM Parts Reference"
        countBadge={total}
        actions={<Button onClick={() => setModalOpen(true)}>+ Create</Button>}
      />

      <div className="rounded border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-700">
        {total} OEM part templates · {brandCount} brands · {fleetCount} in your fleet
      </div>

      <p className="text-sm text-slate-600">
        Universal OEM part templates (world knowledge). This is not company parts inventory — use Maintenance Parts for stocked items.
      </p>

      {query.isError ? <ListErrorBanner onRetry={() => void query.refetch()} /> : null}

      <div className="grid gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-4">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name or part #"
          className="h-9 rounded border border-gray-300 px-2 text-sm md:col-span-2"
        />
        <SelectCombobox
          value={brandFilter}
          onChange={(event) => setBrandFilter(event.target.value)}
          className="h-9 rounded border border-gray-300 px-2 text-sm"
        >
          <option value="">All brands</option>
          {brandOptions.map((brand) => (
            <option key={brand} value={brand}>
              {brand}
            </option>
          ))}
        </SelectCombobox>
        <SelectCombobox
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          className="h-9 rounded border border-gray-300 px-2 text-sm"
        >
          <option value="">All categories</option>
          {OEM_PART_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </SelectCombobox>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={fleetOnly} onChange={(event) => setFleetOnly(event.target.checked)} />
        Fleet brands only (from trucks, trailers, and reefers in your fleet)
      </label>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">Brand</th>
              <th className="px-3 py-2 text-left">OEM Part #</th>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-left">Default Supplier</th>
              <th className="px-3 py-2 text-left">Typical Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: OemPartRow) => (
              <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2">{row.brand}</td>
                <td className="px-3 py-2 text-xs font-medium tracking-normal [font-variant-ligatures:none]">
                  {row.oem_part_number || "—"}
                </td>
                <td className="px-3 py-2">{row.part_name}</td>
                <td className="px-3 py-2">{row.category}</td>
                <td className="px-3 py-2">{row.default_supplier || "—"}</td>
                <td className="px-3 py-2">{formatCost(row.unit_cost_usd_typical)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {emptyText ? <div className="px-3 py-6 text-sm text-gray-500">{emptyText}</div> : null}
      </div>

      <OemPartsCreateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          void query.refetch();
          void brandsQuery.refetch();
        }}
      />
    </div>
  );
}
