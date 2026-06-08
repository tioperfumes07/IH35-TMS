import { aggregateStateGallons } from "../../ifta/ifta-state-gallons-aggregator.js";
import { parseQuarterLabel } from "./mileage-aggregator.service.js";
import { quarterWindow } from "../../ifta/ifta-state-miles-aggregator.js";

export type JurisdictionFuelMap = Record<string, number>;

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export async function aggregateFuelByJurisdiction(
  client: Queryable,
  operatingCompanyId: string,
  quarterLabel: string
): Promise<JurisdictionFuelMap> {
  const { year, quarter } = parseQuarterLabel(quarterLabel);
  const window = quarterWindow(quarter, year);
  const rows = await aggregateStateGallons(client, operatingCompanyId, window);
  const result: JurisdictionFuelMap = {};
  for (const row of rows) {
    result[row.state] = Number(row.gallons ?? 0);
  }
  return result;
}
