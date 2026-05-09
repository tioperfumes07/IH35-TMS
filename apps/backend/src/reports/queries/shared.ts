import { withLuciaBypass } from "../../auth/db.js";

export type QueryContext = {
  operatingCompanyId: string;
};

export type ReportDataEnvelope<T> = {
  generatedAt: string;
  rowCount: number;
  summary: string;
  data: T;
};

export async function runReportQuery<T>(
  context: QueryContext,
  fn: (client: any) => Promise<ReportDataEnvelope<T>>
): Promise<ReportDataEnvelope<T>> {
  return withLuciaBypass(async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [context.operatingCompanyId]);
    return fn(client);
  });
}

export function isoDateInChicago(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

