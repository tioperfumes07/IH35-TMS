import { describe, expect, it, vi, beforeEach } from "vitest";

const fakeUser = { uuid: "00000000-0000-4000-8000-0000000000aa", role: "Owner" };
let rows: unknown[];

vi.mock("../accounting/shared.js", () => ({
  currentAuthUser: () => fakeUser,
  validationError: (reply: { code: (n: number) => { send: (b: unknown) => unknown } }) =>
    reply.code(400).send({ error: "validation_error" }),
  withCompanyScope: async (_u: string, _o: string, fn: (c: unknown) => Promise<unknown>) =>
    fn({ query: async () => ({ rows }) }),
}));

const { registerLoadCancellationsAnalyticsRoutes } = await import("./load-cancellations-analytics.routes.js");

function captureHandler() {
  let handler: ((req: unknown, reply: unknown) => Promise<unknown>) | null = null;
  registerLoadCancellationsAnalyticsRoutes({ get: (_p: string, h: typeof handler) => { handler = h; } } as never);
  return handler!;
}
function makeReply() {
  const out: { code: number; body: unknown } = { code: 200, body: undefined };
  const reply = { code(n: number) { out.code = n; return reply; }, send(b: unknown) { out.body = b; return reply; } };
  return { reply, out };
}
const OCI = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

describe("GET load-cancellations/analytics", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("groups by reason (default) with count + charge + rate totals", async () => {
    rows = [
      { reason_code: "customer_cancelled", reason_label: "Customer cancelled", cancellation_charge_cents: 5000, rate_total_cents: 120000, cancelled_on: "2026-06-17", customer_id: "c1", customer_name: "ACME", driver_id: "d1", driver_name: "ANA LOPEZ" },
      { reason_code: "customer_cancelled", reason_label: "Customer cancelled", cancellation_charge_cents: 0, rate_total_cents: 80000, cancelled_on: "2026-06-17", customer_id: "c1", customer_name: "ACME", driver_id: null, driver_name: null },
      { reason_code: "no_truck", reason_label: "No truck available", cancellation_charge_cents: 2500, rate_total_cents: 50000, cancelled_on: "2026-06-16", customer_id: "c2", customer_name: "BETA", driver_id: "d1", driver_name: "ANA LOPEZ" },
    ];
    const handler = captureHandler();
    const { reply, out } = makeReply();
    await handler({ query: { operating_company_id: OCI } }, reply);

    expect(out.code).toBe(200);
    const b = out.body as { group_by: string; rows: Array<{ group_key: string; cancellation_count: number; total_charge_cents: number; total_rate_cents: number }> };
    expect(b.group_by).toBe("reason");
    expect(b.rows[0]).toMatchObject({ group_key: "customer_cancelled", cancellation_count: 2, total_charge_cents: 5000, total_rate_cents: 200000 });
    expect(b.rows[1]).toMatchObject({ group_key: "no_truck", cancellation_count: 1, total_charge_cents: 2500, total_rate_cents: 50000 });
  });

  it("honors group_by=driver with Unassigned fallback", async () => {
    rows = [
      { reason_code: "x", reason_label: "X", cancellation_charge_cents: 100, rate_total_cents: 1000, cancelled_on: "2026-06-17", customer_id: "c1", customer_name: "ACME", driver_id: "d1", driver_name: "ANA LOPEZ" },
      { reason_code: "x", reason_label: "X", cancellation_charge_cents: 100, rate_total_cents: 1000, cancelled_on: "2026-06-17", customer_id: "c1", customer_name: "ACME", driver_id: null, driver_name: null },
    ];
    const handler = captureHandler();
    const { reply, out } = makeReply();
    await handler({ query: { operating_company_id: OCI, group_by: "driver" } }, reply);

    const b = out.body as { group_by: string; rows: Array<{ group_key: string; group_label: string }> };
    expect(b.group_by).toBe("driver");
    expect(b.rows.find((x) => x.group_key === "d1")).toMatchObject({ group_label: "ANA LOPEZ" });
    expect(b.rows.find((x) => x.group_key === "unassigned")).toMatchObject({ group_label: "Unassigned" });
  });

  it("returns empty rows when there are no cancellations", async () => {
    rows = [];
    const handler = captureHandler();
    const { reply, out } = makeReply();
    await handler({ query: { operating_company_id: OCI } }, reply);
    const b = out.body as { rows: unknown[] };
    expect(b.rows).toEqual([]);
  });
});
