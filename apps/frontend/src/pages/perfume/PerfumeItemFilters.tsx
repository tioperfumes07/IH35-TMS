/**
 * TIO Perfumes · Item file filters — owner 2026-11-27 17:28 CT: "IN ITEMS WE SHOLD ALSO HAVE FILTERS, MULTIPLE DROP DOWN, IN STOCK, NEVER
 * PURCHASED, ETC. OUT OF STOCK … SCENT FAMILY … MULTIMPLE SELECTOR. BRAND SHOULD BE FILTER COMBOBOX". Every filter is a multi-select;
 * brand, family, scent family and origin type-to-narrow. Counts come from the live items (backend itemFileFacets).
 */
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { getPerfumeItemFacets, type PerfumeItemFacet, type PerfumeItemFilters } from "../../api/perfume";
import { tr } from "./perfumeI18n";

const GENDER: Record<string, string> = { M: "Man", W: "Woman", U: "Unisex", "": "Not set" };
const opts = (rows: PerfumeItemFacet[] | undefined, label?: (v: string) => string) =>
  (rows ?? []).map((r) => ({ value: r.value, label: `${r.label ?? (label ? label(r.value) : r.value || "Not set")} (${r.count.toLocaleString("en-US")})` }));

export function PerfumeItemFilterBar({ value, onChange }: { value: PerfumeItemFilters; onChange: (v: PerfumeItemFilters) => void }) {
  const f = useQuery({ queryKey: ["perfume", "item-file", "facets"], queryFn: getPerfumeItemFacets, staleTime: 5 * 60_000 });
  const s = f.data?.stock;
  const set = (k: keyof PerfumeItemFilters) => (next: string[]) => onChange({ ...value, [k]: next });
  const any = Object.values(value).some((v) => v && v.length);
  const stock = [
    { value: "in_stock", label: `${tr("perfume.itemfilter.in_stock", "In stock")}${s ? ` (${s.in_stock.toLocaleString("en-US")})` : ""}` },
    { value: "out_of_stock", label: `${tr("perfume.itemfilter.out_of_stock", "Out of stock (bought before)")}${s ? ` (${s.out_of_stock.toLocaleString("en-US")})` : ""}` },
    { value: "never_purchased", label: `${tr("perfume.itemfilter.never", "Never purchased")}${s ? ` (${s.never_purchased.toLocaleString("en-US")})` : ""}` },
    { value: "below_min", label: `${tr("perfume.itemfilter.below_min", "Below minimum")}${s ? ` (${s.below_min.toLocaleString("en-US")})` : ""}` },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="perfume-item-filters">
      <MultiSelectDropdown label={tr("perfume.itemfilter.stock", "Stock")} allLabel="All stock" options={stock} selected={value.stock ?? []} onChange={set("stock")} data-testid="perfume-itemfilter-stock" />
      <MultiSelectDropdown label={tr("perfume.itemfilter.brand", "Brand")} allLabel="All brands" searchable options={opts(f.data?.brand)} selected={value.brand ?? []} onChange={set("brand")} loading={f.isLoading} data-testid="perfume-itemfilter-brand" />
      <MultiSelectDropdown label={tr("perfume.itemfilter.type", "Product type")} allLabel="All types" options={opts(f.data?.product_type)} selected={value.product_type ?? []} onChange={set("product_type")} data-testid="perfume-itemfilter-type" />
      <MultiSelectDropdown label={tr("perfume.itemfilter.gender", "Gender")} allLabel="All genders" options={opts(f.data?.gender, (v) => GENDER[v] ?? v)} selected={value.gender ?? []} onChange={set("gender")} data-testid="perfume-itemfilter-gender" />
      <MultiSelectDropdown label={tr("perfume.itemfilter.category", "Category")} allLabel="All categories" searchable options={opts(f.data?.category)} selected={value.category ?? []} onChange={set("category")} data-testid="perfume-itemfilter-category" />
      <MultiSelectDropdown label={tr("perfume.itemfilter.conc", "EDT / EDP / Parfum")} allLabel="All" options={opts(f.data?.conc)} selected={value.conc ?? []} onChange={set("conc")} data-testid="perfume-itemfilter-conc" />
      <MultiSelectDropdown label={tr("perfume.itemfilter.family", "Family")} allLabel="All families" searchable options={opts(f.data?.family)} selected={value.family ?? []} onChange={set("family")} data-testid="perfume-itemfilter-family" />
      <MultiSelectDropdown label={tr("perfume.itemfilter.scent", "Scent family")} allLabel="All scent families" searchable options={opts(f.data?.scent)} selected={value.scent ?? []} onChange={set("scent")} data-testid="perfume-itemfilter-scent" />
      <MultiSelectDropdown label={tr("perfume.itemfilter.origin", "Origin")} allLabel="All countries" searchable options={opts(f.data?.origin)} selected={value.origin ?? []} onChange={set("origin")} data-testid="perfume-itemfilter-origin" />
      {any ? <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => onChange({})} data-testid="perfume-itemfilter-clear">{tr("perfume.itemfilter.clear", "Clear filters")}</Button> : null}
    </div>
  );
}
