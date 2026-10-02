import { computeIftaMiles, samsaraIftaReportFetcher } from "../telematics/ifta-miles.service.js";
import type { SamsaraIftaPeriod, SamsaraIftaVehicleReportResult } from "../integrations/samsara/samsara-client.js";
export type QuarterWindow = {
  quarter: number;
  year: number;
  startDate: string;
  endDateExclusive: string;
};

export type StateMilesRow = {
  state: string;
  miles: number;
  source: string;
};

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export function quarterWindow(quarter: number, year: number): QuarterWindow {
  const startMonth = (quarter - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 1));
  return {
    quarter,
    year,
    startDate: start.toISOString().slice(0, 10),
    endDateExclusive: end.toISOString().slice(0, 10),
  };
}

/** The GPS engine is waiting on Samsara (72-hour processing window / report still processing) — no fallback, ever. */
export class IftaMilesNotReadyError extends Error {
  constructor(public reason: string) {
    super(`ifta_gps_miles_not_ready:${reason}`);
    this.name = "IftaMilesNotReadyError";
  }
}

/**
 * ROUND 288.3 item 1 / ROUND 296 3 — IFTA MILES COME FROM THE GPS APPORTIONMENT ENGINE ONLY. Both IFTA screens (the
 * quarterly preparer and the IFTA report) used to sum each load's FULL miles once in EVERY state it stopped in (the
 * load_stops fallback) — an overstated per-state fuel-tax liability. The miles now come from computeIftaMiles
 * (telematics/ifta-miles.service.ts): Samsara's per-vehicle jurisdiction meters for THIS company's linked units, so
 * the per-state miles of a truck add up to that truck's total miles. Not ready -> IftaMilesNotReadyError, never a
 * load-based estimate.
 */
export async function aggregateStateMiles(
  client: Queryable,
  operatingCompanyId: string,
  window: QuarterWindow,
  opts: { fetchReport?: (p: SamsaraIftaPeriod) => Promise<SamsaraIftaVehicleReportResult> } = {}
): Promise<StateMilesRow[]> {
  const fetchReport = opts.fetchReport ?? samsaraIftaReportFetcher(client, operatingCompanyId);
  const r = await computeIftaMiles(client as never, {
    operatingCompanyId,
    period: { year: window.year, quarter: window.quarter as 1 | 2 | 3 | 4 },
    fetchReport,
  });
  if (r.status !== "ok") throw new IftaMilesNotReadyError(r.reason);
  return r.linked_unit_miles
    .filter((j) => j.total_miles > 0)
    .map((j) => ({ state: j.jurisdiction.toUpperCase(), miles: Math.round(j.total_miles * 1000) / 1000, source: "samsara_gps_apportioned" }))
    .sort((x, y) => x.state.localeCompare(y.state));
}
