import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { listVendors } from "../api/mdata";
import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/layout/PageHeader";
import { ListErrorBanner } from "../components/shared/ListErrorBanner";
import { SecondaryNavTabs } from "../components/shared/SecondaryNavTabs";

const VENDOR_LIST_TAB_IDS = ["all", "active", "inactive", "by-category"] as const;
type VendorListTabId = (typeof VENDOR_LIST_TAB_IDS)[number];

function parseVendorListTab(searchParams: URLSearchParams): VendorListTabId {
  const raw = (searchParams.get("tab") ?? "all").toLowerCase().replace(/\s+/g, "-");
  const normalized = raw === "by_category" ? "by-category" : raw;
  return (VENDOR_LIST_TAB_IDS as readonly string[]).includes(normalized) ? (normalized as VendorListTabId) : "all";
}

export function VendorsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

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
    queryKey: ["vendors", "list-page-all"],
    queryFn: () => listVendors({}).then((result) => result.vendors),
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

  return (
    <div className="space-y-3">
      <PageHeader title="Vendors" subtitle={`${rowsFiltered.length} records`} />
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
      {vendorsQuery.isError ? <ListErrorBanner onRetry={() => void vendorsQuery.refetch()} /> : null}
      <DataTable
        rows={rowsFiltered}
        rowKey={(row) => row.id}
        loading={vendorsQuery.isLoading}
        onRowClick={(row) => navigate(`/vendors/${row.id}`)}
        columns={[
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
          { key: "vendor_type", label: "Type" },
          {
            key: "status",
            label: "Status",
            render: (row) => (row.deactivated_at ? "Inactive" : "Active"),
          },
        ]}
      />
    </div>
  );
}
