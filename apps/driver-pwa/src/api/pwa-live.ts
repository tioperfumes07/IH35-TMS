import type { HosSnapshot } from "@ih35/shared-types";
import { apiRequest } from "./client";

export type PwaHosClocks = HosSnapshot & {
  fuel_level_pct: number | null;
};

export type RecentFuelTransaction = {
  id: string;
  transaction_at: string;
  gallons: number | null;
  total_cost: number;
  location_city: string | null;
  location_state: string | null;
  vendor_name: string | null;
};

export type DriverEquipmentAssignment = {
  truck: {
    unit_id: string;
    unit_number: string | null;
    vin: string | null;
    make: string | null;
    model: string | null;
    assignment_source: string;
  } | null;
  trailer: {
    equipment_id: string;
    equipment_number: string | null;
    equipment_type: string | null;
  } | null;
};

export async function getPwaHosClocks(): Promise<PwaHosClocks> {
  return apiRequest<PwaHosClocks>("/api/v1/driver-pwa/hos-clocks");
}

export async function getRecentFuelTransactions(): Promise<RecentFuelTransaction[]> {
  const payload = await apiRequest<{ rows: RecentFuelTransaction[] }>("/api/v1/driver-pwa/recent-fuel-transactions");
  return payload.rows ?? [];
}

export async function getMyEquipment(): Promise<DriverEquipmentAssignment> {
  return apiRequest<DriverEquipmentAssignment>("/api/v1/driver-pwa/equipment");
}
