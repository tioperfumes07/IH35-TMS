/**
 * SETL-PICK-01 / PICK-006 — entity-scoped catalogs.driver_deduction_types for settlement auto-deduction
 * Type pickers. Read path matches write path (ReferenceSelect createKind=driver_deduction_type).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { driverDeductionTypesCatalogClient, type DriverCatalogRow } from "../api/catalogs-driver";

export type DriverDeductionTypeOption = { value: string; label: string };

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

  return {
    query,
    options,
    labelByCode,
    rows,
  };
}
