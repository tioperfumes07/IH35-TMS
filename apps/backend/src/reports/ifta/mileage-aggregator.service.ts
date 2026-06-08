import { aggregateStateMiles, quarterWindow } from "../../ifta/ifta-state-miles-aggregator.js";

export type JurisdictionMilesMap = Record<string, number>;

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export function parseQuarterLabel(quarter: string): { year: number; quarter: number } {
  const match = quarter.trim().match(/^(\d{4})-Q([1-4])$/i);
  if (!match) throw new Error("invalid_quarter");
  return { year: Number(match[1]), quarter: Number(match[2]) };
}

export async function aggregateMilesByJurisdiction(
  client: Queryable,
  operatingCompanyId: string,
  quarterLabel: string
): Promise<JurisdictionMilesMap> {
  const { year, quarter } = parseQuarterLabel(quarterLabel);
  const window = quarterWindow(quarter, year);
  const rows = await aggregateStateMiles(client, operatingCompanyId, window);
  const result: JurisdictionMilesMap = {};
  for (const row of rows) {
    result[row.state] = Number(row.miles ?? 0);
  }
  return result;
}
