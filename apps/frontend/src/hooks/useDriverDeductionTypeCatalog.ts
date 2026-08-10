/**
 * SETL-PICK-01 / PICK-006 — entity-scoped catalogs.driver_deduction_types for settlement auto-deduction
 * Type pickers. Read path matches write path (ReferenceSelect createKind=driver_deduction_type).
 * CLS-SILENT-CAP: render CappedListNotice (limit 200, total from query) wherever options are shown.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { driverDeductionTypesCatalogClient, type DriverCatalogRow } from "../api/catalogs-driver";

export type DriverDeductionTypeOption = { value: string; label: string };

/** SETL-LINK-01 — recovery policy carried on catalogs.driver_deduction_types (not dead weight). */
export type DriverDeductionTypeRecoveryMeta = {
  default_recovery_rail: string;
  may_draw_escrow: boolean;
  survives_separation: boolean;
  display_name: string;
};

export type UseDriverDeductionTypeCatalogOptions = {
  operatingCompanyId: string;
  enabled?: boolean;
  search?: string;
  /** When set, only rows with may_draw_escrow=true (EscrowForfeitModal). */
  mayDrawEscrowOnly?: boolean;
};

export function driverDeductionTypeQueryKey(
  operatingCompanyId: string,
  search?: string,
  mayDrawEscrowOnly?: boolean
) {
  return ["catalogs", "driver-deduction-types", operatingCompanyId, search ?? "", mayDrawEscrowOnly ?? false] as const;
}

export function mapDriverDeductionTypeRows(
  rows: DriverCatalogRow[],
  mayDrawEscrowOnly?: boolean
): DriverDeductionTypeOption[] {
  return rows
    .filter((row) => !mayDrawEscrowOnly || row.may_draw_escrow === true)
    .map((row) => ({
      value: row.code,
      label: row.display_name,
    }));
}

export function buildDriverDeductionTypeLabelMap(rows: DriverCatalogRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.code, row.display_name);
  }
  return map;
}

export function buildDriverDeductionTypeRecoveryMetaMap(
  rows: DriverCatalogRow[]
): Map<string, DriverDeductionTypeRecoveryMeta> {
  const map = new Map<string, DriverDeductionTypeRecoveryMeta>();
  for (const row of rows) {
    map.set(row.code, {
      default_recovery_rail: row.default_recovery_rail ?? "ask",
      may_draw_escrow: Boolean(row.may_draw_escrow),
      survives_separation: Boolean(row.survives_separation),
      display_name: row.display_name,
    });
  }
  return map;
}

/**
 * DoD §8 ask options for a catalog row: never offer escrow/split when may_draw_escrow=false
 * (matches ck_driver_deduction_types_escrow_rail_coherent).
 */
export function recoveryRailOptionsForMeta(meta: DriverDeductionTypeRecoveryMeta | null | undefined): string[] {
  const all = ["escrow", "settlement", "split", "ask"];
  if (!meta || meta.may_draw_escrow) return all;
  return all.filter((rail) => rail !== "escrow" && rail !== "split");
}

export function useDriverDeductionTypeCatalog({
  operatingCompanyId,
  enabled = true,
  search,
  mayDrawEscrowOnly = false,
}: UseDriverDeductionTypeCatalogOptions) {
  const query = useQuery({
    queryKey: driverDeductionTypeQueryKey(operatingCompanyId, search, mayDrawEscrowOnly),
    queryFn: () =>
      driverDeductionTypesCatalogClient.list({
        operating_company_id: operatingCompanyId,
        is_active: "true",
        limit: 200,
        search: search || undefined,
      }),
    enabled: enabled && Boolean(operatingCompanyId),
  });

  const rows = query.data?.rows ?? [];

  const options = useMemo(
    () => mapDriverDeductionTypeRows(rows, mayDrawEscrowOnly),
    [rows, mayDrawEscrowOnly]
  );

  const labelByCode = useMemo(() => buildDriverDeductionTypeLabelMap(rows), [rows]);
  const recoveryMetaByCode = useMemo(() => buildDriverDeductionTypeRecoveryMetaMap(rows), [rows]);

  return {
    query,
    options,
    labelByCode,
    recoveryMetaByCode,
    rows,
  };
}
