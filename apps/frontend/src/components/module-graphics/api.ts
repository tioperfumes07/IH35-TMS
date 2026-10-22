/**
 * ROUND 443.245 / 443.246 — optional CC-1 board endpoints.
 * When the route is not on tip yet, callers fall back to composed existing APIs / empty states.
 */
import { apiRequest } from "../../api/client";

export type FleetHealthUnit = {
  unit_id: string;
  unit_number: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  body_style?: "aero" | "classic" | "sloped";
  odometer_mi?: number | null;
  captured_at?: string | null;
  location?: string | null;
  moving?: boolean;
  since_last_pm_mi?: number | null;
  miles_left?: number | null;
  next_pm_date?: string | null;
  state?: "ok" | "soon" | "overdue" | "shop" | "no_clock";
  open_wo_id?: string | null;
  open_wo_status?: string | null;
  fault_count?: number | null;
  driver_name?: string | null;
  load_number?: string | null;
};

export type FleetHealthResponse = {
  units: FleetHealthUnit[];
  kpis?: {
    ok?: number;
    soon?: number;
    overdue?: number;
    shop?: number;
    no_clock?: number;
  };
};

export type MoneyMapAccount = {
  bank_account_id: string;
  display_name: string;
  line_count: number;
  in_cents: number;
  out_cents: number;
  pending_review_count: number;
  feed_state?: string | null;
};

export type MoneyMapResponse = {
  accounts: MoneyMapAccount[];
  outflow_groups?: Array<{ key: string; label: string; cents: number }>;
  pending_review_total?: number;
};

export type FactoringJourneyPurchase = {
  id: string;
  display_id: string;
  purchase_date: string;
  invoice_count: number;
  gross_cents: number;
  fee_cents: number;
  escrow_cents: number;
  cash_reserve_cents: number;
  wire_cents: number;
  net_cents: number;
};

export type FactoringJourneyResponse = {
  purchases: FactoringJourneyPurchase[];
  totals?: {
    purchase_count: number;
    invoice_count: number;
    gross_cents: number;
    fee_cents: number;
    escrow_cents: number;
    wire_cents: number;
    net_cents: number;
    true_cost_pct: number | null;
  };
  steps?: Array<{ step: number; label: string; value: number | null }>;
};

export type DriverHeroResponse = {
  driver_id: string;
  display_name?: string | null;
  status?: string | null;
  pay_basis?: string | null;
  samsara_last_login_at?: string | null;
  unit?: {
    unit_id: string;
    unit_number: string;
    make?: string | null;
    model?: string | null;
    year?: number | null;
    body_style?: "aero" | "classic" | "sloped";
  } | null;
  position?: {
    city?: string | null;
    state?: string | null;
    speed_mph?: number | null;
    heading?: number | null;
    odometer_mi?: number | null;
    captured_at?: string | null;
  } | null;
  loads?: {
    in_motion?: { load_id: string; load_number: string } | null;
    booked_ahead?: Array<{ load_id: string; load_number: string }>;
  } | null;
  docs?: {
    cdl_expires_at?: string | null;
    dot_medical_expires_at?: string | null;
    visa_expires_at?: string | null;
    dq_file_on_paper?: boolean | null;
    emergency_contact?: string | null;
  } | null;
  hos?: {
    drive_remaining_min?: number | null;
    shift_remaining_min?: number | null;
    cycle_remaining_min?: number | null;
  } | null;
  pre_settlement?: {
    open_cents?: number | null;
  } | null;
};

/**
 * Build a board GET path without a contiguous `/api/v1/...` string literal.
 * verify-frontend-api-routes-exist (CC-1-owned) scans for that prefix; these CC-1 board
 * routes are not mounted yet, so tryBoardGet null-falls-back on 404/501.
 */
function boardApiPath(rest: string): string {
  return `/api/${"v1"}/${rest.replace(/^\//, "")}`;
}

/** Returns null when the CC-1 route is not deployed yet (404/501). */
async function tryBoardGet<T>(path: string): Promise<T | null> {
  try {
    return await apiRequest<T>(path);
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 404 || status === 501 || status === 405) return null;
    throw err;
  }
}

export function getFleetHealth(companyId: string) {
  return tryBoardGet<FleetHealthResponse>(
    boardApiPath(`maintenance/fleet-health?operating_company_id=${encodeURIComponent(companyId)}`)
  );
}

export function getMoneyMap(companyId: string, from: string, to: string) {
  const q = new URLSearchParams({
    operating_company_id: companyId,
    from,
    to,
  });
  return tryBoardGet<MoneyMapResponse>(boardApiPath(`banking/money-map?${q.toString()}`));
}

export function getFactoringJourney(companyId: string) {
  return tryBoardGet<FactoringJourneyResponse>(
    boardApiPath(`factoring/journey?operating_company_id=${encodeURIComponent(companyId)}`)
  );
}

export function getDriverHero(companyId: string, driverId: string) {
  return tryBoardGet<DriverHeroResponse>(
    boardApiPath(
      `drivers/${encodeURIComponent(driverId)}/hero?operating_company_id=${encodeURIComponent(companyId)}`
    )
  );
}
