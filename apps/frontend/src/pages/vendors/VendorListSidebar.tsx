import { useMemo } from "react";
import type { VendorOption } from "../../api/mdata";
import { CardLink } from "../../components/shared/CardLink";
import { SidebarPagination } from "../../components/shared/SidebarPagination";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { parseVendorNotes } from "../../lib/vendorProfileMeta";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function fmtMoney(cents: number) {
  return usd.format(cents / 100);
}

function vendorQualityLabel(notes: string | null | undefined) {
  const rating = parseVendorNotes(notes).meta.qualityRating;
  if (rating === "good") return { label: "Good", className: "bg-emerald-100 text-emerald-800" };
  if (rating === "bad") return { label: "Bad", className: "bg-red-100 text-red-800" };
  return { label: "Medium", className: "bg-amber-100 text-amber-800" };
}

type Props = {
  vendors: VendorOption[];
  totalCount: number;
  page: number;
  pageSize: number;
  search: string;
  sortByName: "name_asc" | "name_desc";
  selectedVendorId: string;
  openByVendorId: Map<string, number>;
  onSearchChange: (value: string) => void;
  onSortChange: (value: "name_asc" | "name_desc") => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSelectVendor: (vendorId: string) => void;
};

export function VendorListSidebar({
  vendors,
  totalCount,
  page,
  pageSize,
  search,
  sortByName,
  selectedVendorId,
  openByVendorId,
  onSearchChange,
  onSortChange,
  onPageChange,
  onPageSizeChange,
  onSelectVendor,
}: Props) {
  const sortedVendors = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = vendors.filter((vendor) => {
      if (!q) return true;
      return (
        vendor.name.toLowerCase().includes(q) ||
        String(vendor.vendor_code ?? "").toLowerCase().includes(q) ||
        String(vendor.email ?? "").toLowerCase().includes(q)
      );
    });
    rows.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name);
      return sortByName === "name_asc" ? cmp : -cmp;
    });
    return rows;
  }, [vendors, search, sortByName]);

  return (
    <aside className="w-[216px] flex-shrink-0 rounded border border-gray-200 bg-white p-2" data-vendor-list-sidebar="true">
      <SidebarPagination
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
      <input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search by name or details"
        className="mb-2 mt-2 w-full rounded border border-gray-300 px-2 py-1 text-sm"
      />
      <SelectCombobox
        value={sortByName}
        onChange={(event) => onSortChange(event.target.value as "name_asc" | "name_desc")}
        className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-sm"
      >
        <option value="name_asc">Sort by name</option>
        <option value="name_desc">Sort by name (Z-A)</option>
      </SelectCombobox>
      <div className="max-h-[760px] space-y-1 overflow-y-auto">
        {sortedVendors.map((vendor) => (
          <CardLink
            key={vendor.id}
            href={`/vendors/${vendor.id}`}
            onNavigate={() => onSelectVendor(vendor.id)}
            className={`block w-full rounded border px-2 py-2 text-left ${
              selectedVendorId === vendor.id ? "border-blue-500 bg-blue-50" : "border-transparent hover:bg-gray-50"
            }`}
          >
            <p className="truncate text-sm font-medium text-gray-900">{vendor.name}</p>
            <p className="text-xs text-gray-600">Open balance {fmtMoney(openByVendorId.get(vendor.id) ?? 0)}</p>
            <p className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${vendorQualityLabel(vendor.notes).className}`}>
              {vendorQualityLabel(vendor.notes).label}
            </p>
          </CardLink>
        ))}
        {sortedVendors.length === 0 ? <p className="px-1 py-2 text-xs text-gray-500">No vendors found.</p> : null}
      </div>
      <div className="mt-2">
        <SidebarPagination
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      </div>
    </aside>
  );
}
