import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ order: [] as string[], mint: vi.fn(), latch: vi.fn(), stamp: vi.fn(), ping: vi.fn(), spine: vi.fn() }));
vi.mock("../book-load.service.js", () => ({ ensureDriverBillArtifactsForLoad: h.mint }));
vi.mock("../delivery-evidence-latch.js", () => ({ latchOnDeliveryEvidence: h.latch }));
vi.mock("../stamp-final-delivery-departure.js", () => ({
  loadStatusRequiresDeliveryDepartureStamp: (s: string) => s === "delivered_pending_docs",
  stampFinalActiveDeliveryDeparture: h.stamp, stampEarlierStopsOnDelivery: h.stamp,
}));
vi.mock("../../auth/db.js", () => ({ withSavepoint: async (_client: unknown, _name: string, work: () => Promise<unknown>) => work() }));
vi.mock("../../driver-finance/settlements-load-bookended.service.js", () => ({ pingSettlementOnLoadEvent: h.ping }));
vi.mock("../dispatch-spine-emit.js", () => ({ emitDispatchSpineEvent: h.spine }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn() }));
vi.mock("../../driver-finance/escrow-deduction-pending.service.js", () => ({ emitAutoProposedEscrowEvents: vi.fn() }));
vi.mock("../../outbox/enqueue-outbox-event.js", () => ({ enqueueOutboxEvent: vi.fn() }));
import { transitionDispatchLoadInClientTx } from "../load-transition.service.js";

const company = "5c854333-6ea5-4faa-af31-67cb272fef80";
const load = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const input = { new_status: "delivered_pending_docs" as const, delivered_at: "2026-10-25T19:00:00Z" };
function client() {
  return { query: vi.fn(async (sql: string) => {
    if (sql.includes("UPDATE mdata.loads")) { h.order.push("status"); return { rows: [{ id: load }] }; }
    if (sql.includes("SELECT status")) return { rows: [{ status: "in_transit", trailer_type: "dry_van", load_number: "TEST-ONLY" }] };
    return { rows: [] };
  }) };
}
beforeEach(() => {
  h.order.length = 0;
  for (const [name, fn] of [["stamp", h.stamp], ["mint", h.mint], ["latch", h.latch], ["ping", h.ping], ["spine", h.spine]] as const)
    fn.mockReset().mockImplementation(async () => { h.order.push(name); return name === "mint" ? { outcome: "already_exists" } : undefined; });
});
describe("load transition dependency-inversion parity", () => {
  it("preserves status, stop, bill, latch, settlement, spine order and original transaction identity", async () => {
    const db = client();
    const result = await transitionDispatchLoadInClientTx(db as never, actor, company, load, input);
    expect(h.order).toEqual(["status", "stamp", "mint", "latch", "ping", "spine"]);
    expect(h.mint).toHaveBeenCalledWith(db, { loadId: load, operatingCompanyId: company, actorUserId: actor });
    expect(h.latch).toHaveBeenCalledWith(db, { loadId: load, operatingCompanyId: company, actorUserId: actor, targetStatus: input.new_status });
    expect(result).toEqual({ ok: true, status: input.new_status, driver_bill_mint: { outcome: "already_exists" } });
  });
  it("propagates driver-bill errors without firing later invoice/settlement effects", async () => {
    h.mint.mockRejectedValue(new Error("mint-refused"));
    await expect(transitionDispatchLoadInClientTx(client() as never, actor, company, load, input)).rejects.toThrow("mint-refused");
    expect(h.latch).not.toHaveBeenCalled();
    expect(h.ping).not.toHaveBeenCalled();
  });
  it("propagates latch errors instead of silently dropping invoice work", async () => {
    h.latch.mockRejectedValue(new Error("latch-refused"));
    await expect(transitionDispatchLoadInClientTx(client() as never, actor, company, load, input)).rejects.toThrow("latch-refused");
    expect(h.ping).not.toHaveBeenCalled();
  });
  it("refuses a missing bootstrap before touching the transaction", async () => {
    vi.resetModules();
    const { transitionDispatchLoadInClientTx: unbootstrapped } = await import("../load-transition.service.js");
    const db = client();
    await expect(unbootstrapped(db as never, actor, company, load, input)).rejects.toThrow("load_transition_hooks_unregistered");
    expect(db.query).not.toHaveBeenCalled();
  });
});
