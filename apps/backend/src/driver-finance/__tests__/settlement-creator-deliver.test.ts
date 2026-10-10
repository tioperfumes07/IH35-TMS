import { describe, expect, it, vi } from "vitest";
import { deliverLoadThroughDispatch } from "../settlement-creator.service.js";

function client(start: string) {
  let status = start;
  const c = { query: vi.fn(async (sql: string) => (/SELECT status::text/.test(sql) ? { rows: [{ status }] } : { rows: [] })) };
  const transition = vi.fn(async (_c: unknown, _a: string, _co: string, _l: string, input: { new_status: string }) => {
    status = input.new_status;
    return { ok: true };
  });
  return { c, transition, get status() { return status; } };
}

describe("ROUND 443.3 — the Creator delivers a load through dispatch's one transition engine", () => {
  it("walks dispatched -> in_transit -> delivered_pending_docs, stamping the delivery date on the last step", async () => {
    const t = client("dispatched");
    await deliverLoadThroughDispatch(t.c as never, "u", "co", "l", "2026-08-07", t.transition as never);
    expect(t.transition.mock.calls.map((x) => x[4].new_status)).toEqual(["in_transit", "delivered_pending_docs"]);
    expect(t.transition.mock.calls[1][4].delivered_at).toBe("2026-08-07T18:00:00.000Z");
    expect(t.status).toBe("delivered_pending_docs");
  });
  it("an already-delivered load is left alone", async () => {
    const t = client("delivered_pending_docs");
    await deliverLoadThroughDispatch(t.c as never, "u", "co", "l", "2026-08-07", t.transition as never);
    expect(t.transition).not.toHaveBeenCalled();
  });
  it("a refusal from dispatch stops the post (never a status UPDATE around it)", async () => {
    const t = client("dispatched");
    const refuse = vi.fn(async () => ({ error: "invalid_transition" }));
    await expect(deliverLoadThroughDispatch(t.c as never, "u", "co", "l", null, refuse as never)).rejects.toMatchObject({ code: "load_delivery_refused" });
  });
  it("a cancelled load cannot be delivered", async () => {
    const t = client("cancelled");
    await expect(deliverLoadThroughDispatch(t.c as never, "u", "co", "l", null, t.transition as never)).rejects.toMatchObject({ code: "load_not_deliverable" });
  });
});
