/**
 * LEAD RULING 15:10Z #2: "Empty (deadhead) miles: Settlement Creator = the signed document's empty miles ONLY (document decides
 * pay); never auto-filled from the engine; blank when the document has none. Live booking (Book Load) = Google estimate at
 * booking is allowed." The Creator seed used to call fillLoadDeadhead after booking whenever the document printed no empty
 * miles (settlement-creator-seed-loads.ts:531, RULING 443.86 #1) — 69 live USMCA Creator loads carry an engine deadhead.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const bookLoadOnClient = vi.fn();
vi.mock("../../dispatch/book-load.service.js", () => ({ bookLoadOnClient: (...a: unknown[]) => bookLoadOnClient(...a) }));
vi.mock("../creator-trailer-choice.js", () => ({
  CREATOR_TRAILER_REQUIRED_MESSAGE: "trailer required",
  creatorTrailerChoice: vi.fn(async () => ({ kind: "none" })),
  creatorLoadTrailerChoice: vi.fn(async () => ({ kind: "none" })),
  creatorLoadTrailerEquipmentId: vi.fn(async () => "equipment-type-id"),
}));
const fillLoadDeadhead = vi.fn(async () => ({ status: "filled", miles: 55 }));
vi.mock("../../dispatch/mileage/miles-recommendations.service.js", () => ({ fillLoadDeadhead: (...a: unknown[]) => fillLoadDeadhead(...(a as [])) }));

const { ensureDispatchedLoadsForCreator } = await import("../settlement-creator-seed-loads.js");
const { creatorEmptyPayCents } = await import("../settlement-creator-empty-pay.js");
import type { SettlementCreatorDraft, SettlementCreatorLoadBlock } from "../settlement-creator.types.js";

const CO = "00000000-0000-4000-8000-000000000001";
const actor = { uuid: "00000000-0000-4000-8000-000000000004", role: "Owner" };

const loadBlock = (over: Partial<SettlementCreatorLoadBlock>): SettlementCreatorLoadBlock =>
  ({
    load_number: "MOCK-1",
    factoring: "direct",
    customer_name: "Mock Shipper",
    customer_po_number: "PO-1",
    pickup_date: "2026-10-01",
    pickup_city: "Laredo", pickup_state: "TX", pickup_lat: 27.5, pickup_lng: -99.5,
    delivery_city: "Dallas", delivery_state: "TX", delivery_lat: 32.7, delivery_lng: -96.8,
    not_yet_delivered: true,
    miles_shortest: 1263.9,
    loaded_miles: 1300,
    line_haul_rate_cents: 45,
    ...over,
  }) as SettlementCreatorLoadBlock;

const draftWith = (load: SettlementCreatorLoadBlock): SettlementCreatorDraft =>
  ({
    operating_company_id: CO,
    driver_id: "00000000-0000-4000-8000-000000000002",
    trailer_id: null,
    settlement_no: "MOCK",
    loads: [load],
    fuel_purchases: [],
  }) as unknown as SettlementCreatorDraft;

const client = () => ({
  query: vi.fn(async (sql: string) => {
    if (sql.includes("FROM mdata.customers")) return { rows: [{ id: "00000000-0000-4000-8000-0000000000c1" }] };
    return { rows: [] };
  }),
});

beforeEach(() => {
  bookLoadOnClient.mockReset();
  bookLoadOnClient.mockResolvedValue({ result: { kind: "ok", row: { id: "00000000-0000-4000-8000-0000000000a1" } }, afterCommit: () => {} });
  fillLoadDeadhead.mockClear();
});

describe("Lead 15:10Z #2 — the Creator's Empty (deadhead) miles are the signed document's only", () => {
  it("document with no empty miles: the load is booked with a blank deadhead and the engine is never called", async () => {
    await ensureDispatchedLoadsForCreator(client() as never, actor, draftWith(loadBlock({ empty_miles: null })));
    expect(bookLoadOnClient).toHaveBeenCalledTimes(1);
    expect((bookLoadOnClient.mock.calls[0]![1] as { miles_deadhead: number | null }).miles_deadhead).toBeNull();
    expect(fillLoadDeadhead).not.toHaveBeenCalled();
  });

  it("document empty miles: booked verbatim as the load's deadhead; the engine is never called", async () => {
    await ensureDispatchedLoadsForCreator(client() as never, actor, draftWith(loadBlock({ empty_miles: 87.4 })));
    expect((bookLoadOnClient.mock.calls[0]![1] as { miles_deadhead: number | null }).miles_deadhead).toBe(87.4);
    expect(fillLoadDeadhead).not.toHaveBeenCalled();
  });

  it("deadhead pay prices the document's empty miles only — none on the document = $0", () => {
    expect(creatorEmptyPayCents({ empty_miles: null, line_haul_rate_cents: 45 })).toBe(0);
    expect(creatorEmptyPayCents({ empty_miles: 100, line_haul_rate_cents: 45 })).toBe(4500);
  });
});
