// IMPORT-P0b — choke-point proof. deliverQboMasterEntityPush is the single QBO-write funnel for
// masterdata, reached NOT ONLY by the gated outbox handlers but also by the default-ON schedulers
// (sync/qbo-{customers,vendors,accounts}-push.ts) and the qbo.master_entity handler. Gating it here is
// what makes the kill-switch real for all of them. This proves: flag OFF → terminal skip, ZERO QBO POST.
import { describe, it, expect, vi, beforeEach } from "vitest";

const qboPostSpy = vi.fn(async () => ({ Vendor: { Id: "V1" } }));
vi.mock("../integrations/qbo/qbo-entity-write.js", () => ({
  qboPostMasterJson: (...a: unknown[]) => qboPostSpy(...a),
  unwrapIntuitEntity: (x: unknown) => x,
}));

const isEnabledMock = vi.fn();
vi.mock("../lib/feature-flags/service.js", () => ({ isEnabled: (...a: unknown[]) => isEnabledMock(...a) }));

import { deliverQboMasterEntityPush } from "./push.service.js";

const OC = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

function ctx() {
  return {
    client: { query: vi.fn(async () => ({ rows: [] })) },
    eventId: "e1",
    instanceId: "i1",
    log: vi.fn(),
  } as unknown as Parameters<typeof deliverQboMasterEntityPush>[1];
}

beforeEach(() => vi.clearAllMocks());

describe("IMPORT-P0b — deliverQboMasterEntityPush choke-point kill-switch", () => {
  it("flag OFF → terminal skip, ZERO QBO POST (covers the default-ON schedulers + qbo.master_entity handler)", async () => {
    isEnabledMock.mockResolvedValue(false);
    const res = await deliverQboMasterEntityPush(
      { operating_company_id: OC, mirror_row_id: "m1", entity: "vendor", operation: "create" },
      ctx()
    );
    expect(res).toEqual({ message: "qbo_entity_push_disabled_skip" });
    expect(qboPostSpy).not.toHaveBeenCalled();
  });
});
