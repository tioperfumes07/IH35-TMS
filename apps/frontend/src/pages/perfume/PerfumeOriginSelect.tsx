/** Country of origin picker — owner 2026-11-27 17:17 CT "country of origin … a correct catalog for all items". Offers the Catalogs →
 *  Items → Country of origin list (2-letter codes, name beside); a code already on the item stays offered even if archived. */
import { useQuery } from "@tanstack/react-query";
import { listPerfumeCatalogs } from "../../api/perfume";
import { ctl } from "./perfumeDocParts";
import { countryLabel } from "./perfumeCountries";

export function PerfumeOriginSelect({ value, onChange, className, testId }: { value: string; onChange: (code: string) => void; className?: string; testId?: string }) {
  const cats = useQuery({ queryKey: ["perfume", "catalogs"], queryFn: listPerfumeCatalogs, staleTime: 60_000 });
  const codes = (cats.data?.kinds.find((k) => k.kind === "origin_country")?.values ?? []).map((v) => v.value);
  const all = [...new Set([...codes, ...(value ? [value] : [])])].sort((a, b) => countryLabel(a).localeCompare(countryLabel(b)));
  return (
    <select className={className ?? `${ctl} block w-[180px]`} aria-label="Country of origin" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId}>
      <option value="">—</option>
      {all.map((c) => <option key={c} value={c}>{countryLabel(c)}</option>)}
    </select>
  );
}
