/**
 * GAP-61 / CAP-11 fuel fraud alerts — read client for the reverse hops onto the truck, driver,
 * load and vendor hubs (linkage law §6, PR #23729: apps/backend/src/integrations/fuel/
 * fraud-detector/routes.ts GET /api/v1/fuel/fraud-alerts now accepts unit_id/driver_id/load_id/
 * vendor_id and rows carry those plus total_cost/recovery_event_id/recovery_status). The office
 * worklist (FraudAlertsList.tsx) calls apiRequest directly with status/severity only; this is the
 * shared shape for the narrower hub-scoped reverse sections.
 */
import { apiRequest } from "./client";

export type FuelFraudAlertRow = {
  uuid: string;
  fuel_transaction_uuid: string;
  rule_id: string;
  severity: "info" | "warn" | "critical";
  detected_at: string;
  status: string;
  transaction_at: string;
  gallons: number | null;
  location_city: string | null;
  location_state: string | null;
  unit_id: string | null;
  driver_id: string | null;
  load_id: string | null;
  vendor_id: string | null;
  total_cost: number | null;
  recovery_event_id: string | null;
  recovery_status: string | null;
  /** True when the fuel purchase behind the alert was voided / archived (round 297 audit). */
  fuel_transaction_voided?: boolean;
};

export type FuelFraudAlertFilter =
  | { unit_id: string }
  | { driver_id: string }
  | { load_id: string }
  | { vendor_id: string };

export function listFuelFraudAlerts(operatingCompanyId: string, filter: FuelFraudAlertFilter) {
  const search = new URLSearchParams({ operating_company_id: operatingCompanyId });
  for (const [key, value] of Object.entries(filter)) {
    if (value) search.set(key, value as string);
  }
  return apiRequest<{ alerts: FuelFraudAlertRow[] }>(`/api/v1/fuel/fraud-alerts?${search.toString()}`);
}
