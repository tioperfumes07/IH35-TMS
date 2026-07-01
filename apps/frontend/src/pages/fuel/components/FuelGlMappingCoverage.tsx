import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listExpenseCategoryMappings } from "../../../api/accounting";

// FUEL-2 (verify-only, NON-posting): confirm every fuel transaction category maps to a real
// catalogs.accounts GL account (via the EXISTING expense_category_map, category_kind='fuel') and
// SURFACE any unmapped category here instead of silently dropping it. This screen does NO GL posting
// — that is the Tier-1 CHAIN fuel-posting engine (apps/backend/.../fuel-posting/poster.service.ts),
// out of scope. It only READS the mapping table so an operator sees coverage gaps before posting runs.
//
// The canonical fuel category codes mirror the backend poster's FUEL_CATEGORY_CODES
// (diesel/def/reefer/oil/misc). Keep in lockstep with poster.service.ts. Fuel tax (IFTA) is a
// separate jurisdictional subsystem and is not an expense_category_map row, so it is not checked here.
export const FUEL_GL_CATEGORY_CODES = ["diesel", "def", "reefer", "oil", "misc"] as const;
export type FuelGlCategoryCode = (typeof FUEL_GL_CATEGORY_CODES)[number];

const CATEGORY_LABEL: Record<FuelGlCategoryCode, string> = {
  diesel: "Diesel",
  def: "DEF",
  reefer: "Reefer fuel",
  oil: "Oil",
  misc: "Misc fuel",
};

export function FuelGlMappingCoverage({ companyId }: { companyId: string }) {
  const mappingsQuery = useQuery({
    queryKey: ["fuel", "gl-mapping-coverage", companyId],
    queryFn: () => listExpenseCategoryMappings(companyId, { category_kind: "fuel" }),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  const mappedCodes = useMemo(() => {
    const set = new Set<string>();
    for (const row of mappingsQuery.data?.rows ?? []) {
      if (!row.is_active) continue;
      if (row.category_kind !== "fuel") continue;
      set.add(row.category_code.trim().toLowerCase());
    }
    return set;
  }, [mappingsQuery.data]);

  const coverage = useMemo(
    () =>
      FUEL_GL_CATEGORY_CODES.map((code) => ({
        code,
        label: CATEGORY_LABEL[code],
        mapped: mappedCodes.has(code),
      })),
    [mappedCodes],
  );
  const unmappedCount = coverage.filter((c) => !c.mapped).length;
  const mappedCount = coverage.length - unmappedCount;

  return (
    <section
      className="rounded border border-gray-200 bg-white p-4"
      data-testid="fuel-gl-mapping-coverage"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Fuel to GL mapping coverage</h3>
        <span className="text-[11px] font-semibold text-slate-600" data-testid="fuel-gl-mapping-summary">
          {mappedCount} of {coverage.length} categories mapped
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-600">
        Each fuel category must map to a chart-of-accounts expense account before fuel posting runs.
        Read-only check of the expense category map (no GL posting is performed here).
      </p>

      {mappingsQuery.isLoading ? (
        <p className="mt-3 text-xs text-gray-500">Loading fuel GL mappings…</p>
      ) : mappingsQuery.isError ? (
        <p className="mt-3 text-xs text-red-700" data-testid="fuel-gl-mapping-error">
          Could not load fuel GL mappings for this company.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {coverage.map((c) => (
              <span
                key={c.code}
                data-testid={`fuel-gl-map-badge-${c.code}`}
                data-mapped={c.mapped ? "true" : "false"}
                className={
                  c.mapped
                    ? "inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700"
                    : "inline-flex items-center gap-1.5 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800"
                }
              >
                <span
                  className={`inline-block h-[7px] w-[7px] rounded-full ${c.mapped ? "bg-slate-400" : "bg-amber-500"}`}
                />
                {c.label}
                <span className="text-[10px] font-normal">{c.mapped ? "mapped" : "unmapped"}</span>
              </span>
            ))}
          </div>

          {unmappedCount > 0 ? (
            <div
              className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900"
              data-testid="fuel-gl-mapping-warning"
            >
              {unmappedCount} fuel {unmappedCount === 1 ? "category is" : "categories are"} not mapped to a
              GL account. Fuel spend in {unmappedCount === 1 ? "this category" : "these categories"} cannot
              post until mapped. Add the mapping in the expense category map below.
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
