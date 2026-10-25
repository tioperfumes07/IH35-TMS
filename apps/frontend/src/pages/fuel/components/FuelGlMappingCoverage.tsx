/**
 * ROUND 443.326 — KPI + bordered FuelBoardSection (no V3Panel). listExpenseCategoryMappings read-only.
 *
 * FUEL-2 (verify-only, NON-posting): confirm every fuel transaction category maps to a real
 * catalogs.accounts GL account (via the EXISTING expense_category_map, category_kind='fuel') and
 * SURFACE any unmapped category here instead of silently dropping it. This screen does NO GL posting
 * — that is the Tier-1 CHAIN fuel-posting engine (apps/backend/.../fuel-posting/poster.service.ts),
 * out of scope. It only READS the mapping table so an operator sees coverage gaps before posting runs.
 *
 * The canonical fuel category codes mirror the backend poster's FUEL_CATEGORY_CODES
 * (diesel/def/reefer/oil/misc). Keep in lockstep with poster.service.ts. Fuel tax (IFTA) is a
 * separate jurisdictional subsystem and is not an expense_category_map row, so it is not checked here.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { listExpenseCategoryMappings } from "../../../api/accounting";
import { InfoPopover } from "../../../components/shared/InfoPopover";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { FuelBoardSection } from "../FuelBoardSection";

export const FUEL_GL_CATEGORY_CODES = ["diesel", "def", "reefer", "oil", "misc"] as const;
export type FuelGlCategoryCode = (typeof FUEL_GL_CATEGORY_CODES)[number];

const CATEGORY_LABEL: Record<FuelGlCategoryCode, string> = {
  diesel: "Diesel",
  def: "DEF",
  reefer: "Reefer Diesel",
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
  const ready = !mappingsQuery.isLoading && !mappingsQuery.isError;

  return (
    <div className="space-y-3" data-testid="fuel-gl-mapping-coverage">
      {/* ROUND 443.250 Expense mapping V3 — same mapped/unmapped counts from expense_category_map. */}
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}
        data-testid="fuel-expense-map-v3-kpi-strip"
        data-fuel-expense-map-v3-kpis="1"
      >
        <V3KpiTile
          label="Mapped"
          value={ready ? String(mappedCount) : "—"}
          sub="active fuel categories"
          tone={ready && mappedCount === coverage.length ? "green" : "ink"}
          testId="fuel-expense-map-kpi-mapped"
        />
        <V3KpiTile
          label="Unmapped"
          value={ready ? String(unmappedCount) : "—"}
          sub="block fuel posting"
          tone={ready && unmappedCount > 0 ? "red" : "ink"}
          testId="fuel-expense-map-kpi-unmapped"
        />
        <V3KpiTile
          label="Categories"
          value={String(coverage.length)}
          sub="diesel · def · reefer · oil · misc"
          testId="fuel-expense-map-kpi-categories"
        />
      </div>

      <FuelBoardSection
        title="Fuel to GL mapping coverage"
        subtitle="Read-only check before fuel posting runs"
        testId="fuel-expense-map-v3-panel"
        headerRight={
          <span className="text-xs font-semibold text-[#4B5563]" data-testid="fuel-gl-mapping-summary">
            {mappedCount} of {coverage.length} categories mapped
          </span>
        }
      >
        <div className="px-3 py-3">
          <p className="text-xs text-gray-600">
            Each fuel category must map to a chart-of-accounts expense account before fuel posting runs.{" "}
            <InfoPopover label="About fuel mapping coverage">
              Read-only check of the expense category map (no GL posting is performed here).
            </InfoPopover>
          </p>

          {mappingsQuery.isLoading ? (
            <p className="mt-3 text-xs text-gray-500">Loading fuel GL mappings…</p>
          ) : mappingsQuery.isError ? (
            <div className="mt-3">
              <ListErrorBanner onRetry={() => void mappingsQuery.refetch()} />
            </div>
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
                        ? "inline-flex items-center gap-1.5 rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-2 py-1 text-xs font-medium text-[#1F2A44]"
                        : "inline-flex items-center gap-1.5 rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-2 py-1 text-xs font-semibold text-[#1F2A44]"
                    }
                  >
                    <span
                      className={`inline-block h-[7px] w-[7px] rounded-full ${c.mapped ? "bg-[#6B7280]" : "bg-[#1F2A44]"}`}
                    />
                    {c.label}
                    <span className="text-xs font-normal">{c.mapped ? "mapped" : "unmapped"}</span>
                  </span>
                ))}
              </div>

              {unmappedCount > 0 ? (
                <div
                  className="mt-3 border-t border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-xs text-[#1F2A44]"
                  data-testid="fuel-gl-mapping-warning"
                >
                  {unmappedCount} fuel {unmappedCount === 1 ? "category is" : "categories are"} not mapped to a
                  GL account. Fuel spend in {unmappedCount === 1 ? "this category" : "these categories"} cannot
                  post until mapped. Add the mapping in the expense category map below.
                </div>
              ) : null}
            </>
          )}
        </div>
      </FuelBoardSection>
    </div>
  );
}
