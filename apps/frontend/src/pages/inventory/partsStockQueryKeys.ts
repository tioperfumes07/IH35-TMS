import type { QueryClient } from "@tanstack/react-query";

/**
 * Both mounted stock surfaces read maintenance.parts_inventory through different
 * API projections. Keep their cache identities together so any stock mutation
 * refreshes Inventory > Parts & Stock and Maintenance > Parts Inventory.
 */
export const inventoryPartsStockQueryKey = (operatingCompanyId: string) =>
  ["inventory", "parts", operatingCompanyId] as const;

export const maintenancePartsStockQueryKey = (operatingCompanyId: string) =>
  ["maintenance", "parts-inventory", operatingCompanyId] as const;

export async function invalidatePartsStockQueries(
  queryClient: QueryClient,
  operatingCompanyId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: inventoryPartsStockQueryKey(operatingCompanyId) }),
    queryClient.invalidateQueries({ queryKey: maintenancePartsStockQueryKey(operatingCompanyId) }),
  ]);
}
