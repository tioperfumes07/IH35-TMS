import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { batchCategorizeVendors } from "../api/vendorCategory";
import { createVendor, listVendors, type CreateVendorInput, type VendorOption } from "../api/mdata";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/layout/PageHeader";
import { useToast } from "../components/Toast";
import { VendorCategoryChip } from "../components/vendors/VendorCategoryChip";
import { useCompanyContext } from "../contexts/CompanyContext";
import { dataTableErrorState } from "../lib/tableError";
import { VENDOR_CATEGORY_VALUES, type VendorCategoryValue } from "../lib/vendorCategories";
import { SecondaryNavTabs } from "../components/shared/SecondaryNavTabs";
import { ApiError } from "../api/client";

const VENDOR_LIST_TAB_IDS = ["all", "active", "inactive", "by-category"] as const;
type VendorListTabId = (typeof VENDOR_LIST_TAB_IDS)[number];

function parseVendorListTab(searchParams: URLSearchParams): VendorListTabId {
  const raw = (searchParams.get("tab") ?? "all").toLowerCase().replace(/\s+/g, "-");
  const normalized = raw === "by_category" ? "by-category" : raw;
  return (VENDOR_LIST_TAB_IDS as readonly string[]).includes(normalized) ? (normalized as VendorListTabId) : "all";
}

const VENDOR_TYPES: CreateVendorInput["vendor_type"][] = ["Fuel", "Repair", "Tires", "Towing", "Insurance", "Permit", "Toll", "Other"];

export function VendorsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const [editCategories, setEditCategories] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [batchCategory, setBatchCategory] = useState<VendorCategoryValue>("other");
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createType, setCreateType] = useState<CreateVendorInput["vendor_type"]>("Other");

  const vendorListTab = useMemo(() => parseVendorListTab(searchParams), [searchParams]);
  const categoryFilter = searchParams.get("category") ?? "";

  const setVendorListTab = (next: VendorListTabId) => {
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        if (next === "all") {
          nextParams.delete("tab");
          nextParams.delete("category");
        } else {
          nextParams.set("tab", next);
          if (next !== "by-category") nextParams.delete("category");
        }
        return nextParams;
      },
      { replace: false }
    );
  };

  const setCategoryFilter = (value: string) => {
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        nextParams.set("tab", "by-category");
        if (!value) nextParams.delete("category");
        else nextParams.set("category", value);
        return nextParams;
      },
      { replace: false }
    );
  };

  const vendorsQuery = useQuery({
    queryKey: ["vendors", "list-page", companyId],
    queryFn: () => listVendors(companyId ? { operating_company_id: companyId } : {}).then((result) => result.vendors),
    enabled: Boolean(companyId),
  });

  const allVendors = useMemo(() => vendorsQuery.data ?? [], [vendorsQuery.data]);

  const vendorTypes = useMemo(() => {
    const set = new Set<string>();
    for (const v of allVendors) {
      if (v.vendor_type) set.add(v.vendor_type);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allVendors]);

  const vendorTabCounts = useMemo(() => {
    const active = allVendors.filter((v) => !v.deactivated_at).length;
    const inactive = allVendors.filter((v) => Boolean(v.deactivated_at)).length;
    return {
      all: allVendors.length,
      active,
      inactive,
      byCategory: categoryFilter ? allVendors.filter((v) => v.vendor_type === categoryFilter).length : allVendors.length,
    };
  }, [allVendors, categoryFilter]);

  const rowsFiltered = useMemo(() => {
    let rows = [...allVendors];
    if (vendorListTab === "active") rows = rows.filter((v) => !v.deactivated_at);
    else if (vendorListTab === "inactive") rows = rows.filter((v) => Boolean(v.deactivated_at));
    else if (vendorListTab === "by-category" && categoryFilter) rows = rows.filter((v) => v.vendor_type === categoryFilter);
    return rows;
  }, [allVendors, vendorListTab, categoryFilter]);

  const selectedIds = useMemo(() => Object.entries(selected).filter(([, v]) => v).map(([id]) => id), [selected]);

  const batchMutation = useMutation({
    mutationFn: () =>
      batchCategorizeVendors({
        operating_company_id: companyId,
        vendor_ids: selectedIds,
        category: batchCategory,
        lock: false,
      }),
    onSuccess: async (data) => {
      pushToast(`Updated ${data.updated} vendor(s)`, "success");
      setSelected({});
      setEditCategories(false);
      await queryClient.invalidateQueries({ queryKey: ["vendors"] });
    },
    onError: (e) => {
      pushToast(e instanceof ApiError ? e.message : "Batch categorize failed", "error");
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createVendor({
        name: createName.trim(),
        vendor_type: createType,
        operating_company_id: companyId || undefined,
      }),
    onSuccess: async (row) => {
      pushToast("Vendor created", "success");
      setCreateOpen(false);
      setCreateName("");
      await queryClient.invalidateQueries({ queryKey: ["vendors"] });
      navigate(`/vendors/${row.id}`);
    },
    onError: (e) => pushToast(e instanceof ApiError ? e.message : "Create failed", "error"),
  });

  const columns = useMemo(() => {
    const cols: Array<{
      key: string;
      label: string;
      className?: string;
      cellClass?: string;
      render: (row: VendorOption) => ReactNode;
    }> = [];
    if (editCategories) {
      cols.push({
        key: "pick",
        label: "",
        render: (row) => (
          <input
            type="checkbox"
            checked={Boolean(selected[row.id])}
            onChange={(ev) => setSelected((prev) => ({ ...prev, [row.id]: ev.target.checked }))}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${row.name}`}
          />
        ),
      });
    }
    cols.push(
      {
        key: "name",
        label: "Name",
        className: "max-w-[240px] whitespace-nowrap",
        render: (row) => (
          <span title={row.name} className="single-line-name">
            {row.name}
          </span>
        ),
      },
      { key: "vendor_code", label: "Code", cellClass: "code-cell", render: (row) => row.vendor_code ?? "—" },
      { key: "vendor_type", label: "Type", render: (row) => row.vendor_type },
      {
        key: "vendor_category",
        label: "Category",
        render: (row) => <VendorCategoryChip code={row.vendor_category} />,
      },
      {
        key: "status",
        label: "Status",
        render: (row) => (row.deactivated_at ? "Inactive" : "Active"),
      }
    );
    return cols;
  }, [editCategories, selected]);

  return (
    <div className="space-y-3 pb-16">
      <PageHeader
        title="Vendors"
        subtitle={`${rowsFiltered.length} records`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setEditCategories((e) => !e)}>
              {editCategories ? "Done editing categories" : "Edit categories"}
            </Button>
            <Button type="button" size="sm" disabled={!companyId} onClick={() => setCreateOpen(true)}>
              + Vendor
            </Button>
          </div>
        }
      />
      {!companyId ? <p className="text-sm text-amber-800">Select an operating company to load vendors.</p> : null}
      <SecondaryNavTabs
        className="-mx-2"
        activeId={vendorListTab}
        onChange={(id) => {
          if ((VENDOR_LIST_TAB_IDS as readonly string[]).includes(id)) setVendorListTab(id as VendorListTabId);
        }}
        tabs={[
          { id: "all", label: `All (${vendorTabCounts.all})` },
          { id: "active", label: `Active (${vendorTabCounts.active})` },
          { id: "inactive", label: `Inactive (${vendorTabCounts.inactive})` },
          { id: "by-category", label: `By Category (${vendorTabCounts.byCategory})` },
        ]}
      />
      {vendorListTab === "by-category" ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-semibold text-gray-600" htmlFor="vendor-category-filter">
            Vendor type
          </label>
          <select
            id="vendor-category-filter"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="h-8 max-w-xs rounded border border-gray-300 px-2 text-[13px]"
          >
            <option value="">All types</option>
            {vendorTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <DataTable
        rows={rowsFiltered}
        rowKey={(row) => row.id}
        loading={vendorsQuery.isLoading}
        errorState={dataTableErrorState(vendorsQuery.error, () => void vendorsQuery.refetch())}
        onRowClick={editCategories ? undefined : (row) => navigate(`/vendors/${row.id}`)}
        columns={columns}
      />

      {editCategories && selectedIds.length > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] md:left-20">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium text-gray-800">{selectedIds.length} selected</span>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-9 rounded border border-gray-300 px-2 text-sm"
                value={batchCategory}
                onChange={(e) => setBatchCategory(e.target.value as VendorCategoryValue)}
              >
                {VENDOR_CATEGORY_VALUES.map((c) => (
                  <option key={c} value={c}>
                    {c.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <Button type="button" size="sm" onClick={() => batchMutation.mutate()} loading={batchMutation.isPending} disabled={!companyId}>
                Apply to {selectedIds.length} selected
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New vendor"
        modalKind="vendors-quick-create"
        sizePreset="md"
        resizable
      >
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Name</span>
            <input
              className="mt-1 h-9 w-full rounded border border-gray-300 px-2"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Vendor type</span>
            <select
              className="mt-1 h-9 w-full rounded border border-gray-300 px-2"
              value={createType}
              onChange={(e) => setCreateType(e.target.value as CreateVendorInput["vendor_type"])}
            >
              {VENDOR_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!createName.trim() || !companyId} loading={createMutation.isPending} onClick={() => createMutation.mutate()}>
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
