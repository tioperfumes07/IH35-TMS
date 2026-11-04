import { useMemo, useState } from "react";
import { CatalogListSearchInput } from "../../../components/lists/CatalogListSearchInput";
import { catalogListSearchQueryOptions } from "../../../hooks/catalogListSearchQueryOptions";
import { useCreateQueryParam } from "../../../hooks/useCreateQueryParam";
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
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { SelectCombobox } from "../../../components/Combobox";
import { MultiSelectDropdown } from "../../../components/forms/MultiSelectDropdown";
import { ListsSubNav } from "../ListsSubNav";
import { userFacingApiError } from "../../../lib/api-error-message";
import { useCompanyContext } from "../../../contexts/CompanyContext";

/** U12: 0/2+ → undefined, 1 → scalar API. */
function apiScalar(selected: string[]): string | undefined {
  if (selected.length === 1) return selected[0];
  return undefined;
}

function formatCost(value: string | null) {
  if (!value) return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return `$${num.toFixed(2)}`;
}

const COLUMNS: Array<ParityColumn<OemPartRow>> = [
  { key: "brand", label: "Brand", sortable: true },
  {
    key: "oem_part_number",
    label: "OEM Part #",
    sortable: true,
    cellClass: "text-xs font-medium tracking-normal [font-variant-ligatures:none]",
    render: (row) => row.oem_part_number || "—",
  },
  { key: "part_name", label: "Name", sortable: true },
  { key: "category", label: "Category", sortable: true },
  {
    key: "default_supplier",
    label: "Default Supplier",
    sortable: true,
    render: (row) => row.default_supplier || "—",
  },
  {
    key: "unit_cost_usd_typical",
    label: "Typical Cost",
    sortable: true,
    sortValue: (row) => {
      if (!row.unit_cost_usd_typical) return null;
      const num = Number(row.unit_cost_usd_typical);
      return Number.isNaN(num) ? row.unit_cost_usd_typical : num;
    },
    render: (row) => formatCost(row.unit_cost_usd_typical),
  },
];

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
      setError(userFacingApiError(err, "Failed to create OEM part template"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal variant="drawer" open={open} onClose={onClose} title="Create OEM Part Template">
      <div className="space-y-3">
        <label className="block text-xs">
          Brand
          <input
            value={form.brand}
            onChange={(event) => setForm((prev) => ({ ...prev, brand: event.target.value }))}
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2"
          />
        </label>
        <label className="block text-xs">
          OEM Part #
          <input
            value={form.oem_part_number ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, oem_part_number: event.target.value }))}
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2"
          />
        </label>
        <label className="block text-xs">
          Name
          <input
            value={form.part_name}
            onChange={(event) => setForm((prev) => ({ ...prev, part_name: event.target.value }))}
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2"
          />
        </label>
        <label className="block text-xs">
          Category
          <SelectCombobox
            value={form.category}
            onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2"
          >
            {OEM_PART_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <label className="block text-xs">
          Default Supplier
          <input
            value={form.default_supplier ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, default_supplier: event.target.value }))}
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2"
          />
        </label>
        {error ? <div className="text-xs text-red-600">{error}</div> : null}
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
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [fleetOnly, setFleetOnly] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const brandApi = apiScalar(brandFilter);
  const categoryApi = apiScalar(categoryFilter);
  const brandKey = brandFilter.slice().sort().join(",") || "all";
  const categoryKey = categoryFilter.slice().sort().join(",") || "all";

  // LST-F5218 — Lists hub ?create=1 must open OEM part create modal.
  useCreateQueryParam({
    companyId,
    onOpenCreate: () => setModalOpen(true),
  });

  const query = useQuery({
    queryKey: ["lists", "oem-parts", search, brandKey, categoryKey, fleetOnly],
    queryFn: () =>
      oemPartsCatalogClient.list({
        operating_company_id: companyId,
        q: search || undefined,
        brand: brandApi,
        category: categoryApi,
        fleet_only: fleetOnly,
      }),
    enabled: Boolean(companyId),
    ...catalogListSearchQueryOptions,
  });

  const brandsQuery = useQuery({
    queryKey: ["lists", "oem-parts", "brands"],
    queryFn: () => oemPartsCatalogClient.brands(companyId),
    enabled: Boolean(companyId),
  });

  const allRows = query.data?.rows ?? [];
  const rows = (showInactive ? allRows : allRows.filter((r) => !r.archived_at)).filter((r) => {
    // U12: 2+ selections — API unscoped; narrow client-side.
    if (brandFilter.length >= 2 && !brandFilter.includes(String(r.brand ?? ""))) return false;
    if (categoryFilter.length >= 2 && !categoryFilter.includes(String(r.category ?? ""))) return false;
    return true;
  });
  const total = query.data?.total_count ?? 0;
  const brandCount = query.data?.brand_count ?? 0;
  const fleetCount = query.data?.fleet_count ?? 0;

  const brandOptions = useMemo(() => {
    const fromApi = brandsQuery.data?.rows?.map((row) => row.brand) ?? [];
    return [...new Set(fromApi)].sort();
  }, [brandsQuery.data?.rows]);

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

      <div className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-xs text-[#1F2A44]">
        {total} OEM part templates · {brandCount} brands · {fleetCount} in your fleet
      </div>

      <p className="text-xs text-[#4B5563]">
        Universal OEM part templates (world knowledge). This is not company parts inventory — use Maintenance Parts for stocked items.
      </p>

      {query.isError ? <ListErrorBanner onRetry={() => void query.refetch()} /> : null}

      <div className="grid gap-2 rounded-sm border border-gray-200 bg-white p-3 md:grid-cols-4">
        {/* MAINT-F3508: server-bound OEM search (q) — keep; ParityTable toolbar Search suppressed */}
        <CatalogListSearchInput value={search} onChange={setSearch} placeholder="Search name or part #" className="h-9 rounded-sm border border-gray-300 px-2 text-xs md:col-span-2" />
        <div className="text-xs font-semibold text-[#4B5563]" data-testid="oem-parts-brand-filter">
          <span className="block">Brand</span>
          <div className="mt-1">
            <MultiSelectDropdown
              label="Brand"
              options={brandOptions.map((brand) => ({ value: brand, label: brand }))}
              selected={brandFilter}
              onChange={setBrandFilter}
              allLabel="All brands"
              data-testid="oem-parts-brand-multiselect"
            />
          </div>
        </div>
        <div className="text-xs font-semibold text-[#4B5563]" data-testid="oem-parts-category-filter">
          <span className="block">Category</span>
          <div className="mt-1">
            <MultiSelectDropdown
              label="Category"
              options={OEM_PART_CATEGORIES.map((category) => ({ value: category, label: category }))}
              selected={categoryFilter}
              onChange={setCategoryFilter}
              allLabel="All categories"
              data-testid="oem-parts-category-multiselect"
            />
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-[#1F2A44]">
        <input type="checkbox" checked={fleetOnly} onChange={(event) => setFleetOnly(event.target.checked)} />
        Fleet brands only (from trucks, trailers, and reefers in your fleet)
      </label>

      <label className="flex items-center gap-1 text-xs text-gray-600">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
          className="h-3.5 w-3.5 rounded-sm border-gray-300"
        />
        Show inactive
      </label>

      <ParityTable<OemPartRow>
        columns={COLUMNS}
        title="OEM parts catalog"
        rows={rows}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        emptyText="No OEM part templates found."
        storageKey="lists-oem-parts-catalog"
        tableTestId="oem-parts-catalog-table"
        // MAINT-F3508: keep API search above; hide ParityTable toolbar Search
        suppressToolbarSearch
      />

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
