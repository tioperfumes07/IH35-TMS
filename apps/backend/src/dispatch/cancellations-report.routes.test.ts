import { describe, expect, it, vi, beforeEach } from "vitest";

const fakeUser = { uuid: "00000000-0000-4000-8000-0000000000aa", role: "Owner" };
let rows: unknown[];

vi.mock("../accounting/shared.js", () => ({
  currentAuthUser: () => fakeUser,
  validationError: (reply: { code: (n: number) => { send: (b: unknown) => unknown } }) => reply.code(400).send({ error: "validation_error" }),
  withCompanyScope: async (_u: string, _o: string, fn: (c: unknown) => Promise<unknown>) =>
    fn({ query: async () => ({ rows }) }),
}));

const { registerCancellationsReportRoutes } = await import("./cancellations-report.routes.js");

function captureHandler() {
  let handler: ((req: unknown, reply: unknown) => Promise<unknown>) | null = null;
  registerCancellationsReportRoutes({ get: (_p: string, h: typeof handler) => { handler = h; } } as never);
  return handler!;
}
function makeReply() {
  const out: { code: number; body: unknown } = { code: 200, body: undefined };
  const reply = { code(n: number) { out.code = n; return reply; }, send(b: unknown) { out.body = b; return reply; } };
  return { reply, out };
}
const OCI = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

describe("GET cancellations-report", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("aggregates by reason / driver / customer / date with charge totals", async () => {
    rows = [
      { reason_code: "customer_cancelled", reason_label: "Customer cancelled", cancellation_charge_cents: 5000, billable_to_customer: true, cancelled_on: "2026-06-17", customer_id: "c1", customer_name: "ACME", driver_id: "d1", driver_name: "ANA LOPEZ" },
      { reason_code: "customer_cancelled", reason_label: "Customer cancelled", cancellation_charge_cents: 0, billable_to_customer: false, cancelled_on: "2026-06-17", customer_id: "c1", customer_name: "ACME", driver_id: null, driver_name: null },
      { reason_code: "no_truck", reason_label: "No truck available", cancellation_charge_cents: 2500, billable_to_customer: true, cancelled_on: "2026-06-16", customer_id: "c2", customer_name: "BETA", driver_id: "d1", driver_name: "ANA LOPEZ" },
    ];
    const handler = captureHandler();
    const { reply, out } = makeReply();
    await handler({ query: { operating_company_id: OCI } }, reply);

    expect(out.code).toBe(200);
    const b = out.body as any;
    expect(b.total).toEqual({ count: 3, total_charge_cents: 7500, billable_count: 2 });
    // by_reason: customer_cancelled (2) before no_truck (1)
    expect(b.by_reason[0]).toMatchObject({ key: "customer_cancelled", count: 2, total_charge_cents: 5000, billable_count: 1 });
    expect(b.by_reason[1]).toMatchObject({ key: "no_truck", count: 1, total_charge_cents: 2500 });
    // by_driver: d1 (2) + unassigned (1)
    expect(b.by_driver.find((x: any) => x.key === "d1")).toMatchObject({ count: 2, label: "ANA LOPEZ" });
    expect(b.by_driver.find((x: any) => x.key === "unassigned")).toMatchObject({ count: 1, label: "Unassigned" });
    // by_customer + by_date present
    expect(b.by_customer.find((x: any) => x.key === "c1")).toMatchObject({ count: 2, label: "ACME" });
    expect(b.by_date.find((x: any) => x.key === "2026-06-17")).toMatchObject({ count: 2 });
  });

  it("returns empty buckets + zero totals when there are no cancellations", async () => {
    rows = [];
    const handler = captureHandler();
    const { reply, out } = makeReply();
    await handler({ query: { operating_company_id: OCI } }, reply);
    const b = out.body as any;
    expect(b.total).toEqual({ count: 0, total_charge_cents: 0, billable_count: 0 });
    expect(b.by_reason).toEqual([]);
    expect(b.by_driver).toEqual([]);
  });
});
