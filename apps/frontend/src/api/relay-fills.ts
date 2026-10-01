/**
 * Linkage law §6 (PR #23729) — Relay fills (integrations.relay_fuel_transactions) never become
 * fuel.fuel_transactions rows (ROUND 43 owner ruling cut that bridge after it duplicated
 * Dreamline), so without this read a Relay fill was reachable from NO hub. Backend:
 * apps/backend/src/fuel/relay-fills.routes.ts, GET /api/v1/fuel/relay-fills.
 */
import { apiRequest } from "./client";

export type RelayFillRow = {
  id: string;
  transaction_id: string;
  relay_created_at: string;
  merchant_name: string | null;
  location_name: string | null;
  location_city: string | null;
  location_state: string | null;
  total_amount_paid_cents: number;
  posted_to_gl: boolean;
  unit_id: string | null;
  unit_number: string | null;
  driver_id: string | null;
  driver_name: string | null;
  /** Relay's own free-text driver/unit — present even when matching failed or disagrees. */
  relay_driver_name: string | null;
  relay_unit_number: string | null;
  fuel_gallons: number | null;
  def_gallons: number | null;
};

export type RelayFillListFilter = {
  unit_id?: string;
  driver_id?: string;
  unmatched?: boolean;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export function listRelayFills(operatingCompanyId: string, filter: RelayFillListFilter = {}) {
  const search = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (filter.unit_id) search.set("unit_id", filter.unit_id);
  if (filter.driver_id) search.set("driver_id", filter.driver_id);
  if (filter.unmatched) search.set("unmatched", "true");
  if (filter.from) search.set("from", filter.from);
  if (filter.to) search.set("to", filter.to);
  if (filter.limit !== undefined) search.set("limit", String(filter.limit));
  if (filter.offset !== undefined) search.set("offset", String(filter.offset));
  return apiRequest<{ rows: RelayFillRow[]; total_count: number; has_more: boolean }>(
    `/api/v1/fuel/relay-fills?${search.toString()}`
  );
}
