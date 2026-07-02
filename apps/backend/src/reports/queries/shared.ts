import { withLuciaBypass } from "../../auth/db.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";

export type QueryContext = {
  operatingCompanyId: string;
  // Cross-tenant guard: when a report is generated on behalf of an authenticated request
  // (e.g. the /scheduled/:id/test-send route), the actor's user id is threaded here so that
  // membership in operatingCompanyId is verified BEFORE the withLuciaBypass block runs.
  // withLuciaBypass turns RLS fully OFF, so this assert is the ONLY tenant boundary on this path.
  // Cron/scheduler callers derive operatingCompanyId internally (iterating enabled companies /
  // subscription rows), NOT from a request, and legitimately omit actorUserId — no user to check.
  actorUserId?: string | null;
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
  // Verify membership on the request-driven path (actorUserId present) before defeating RLS via bypass.
  if (context.actorUserId) {
    await assertCompanyMembership(context.actorUserId, context.operatingCompanyId);
  }
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

