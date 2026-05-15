import { vendorCategoryChipClasses, vendorCategoryLabel } from "../../lib/vendorCategories";

export function VendorCategoryChip({ code }: { code: string | null | undefined }) {
  if (!code) return <span className="text-xs text-gray-500">—</span>;
  const label = vendorCategoryLabel(code);
  return (
    <span className={`inline-flex max-w-[10rem] truncate rounded border px-1.5 py-0.5 text-[10px] font-semibold capitalize ${vendorCategoryChipClasses(code)}`} title={label}>
      {label}
    </span>
  );
}
