// IMPORT-P0b proof harness (representative handler). The invoice handler is the template; the static
// guard verify-qbo-entity-push-gates.mjs enforces that the other five handlers are wired identically
// (gate called before the deliverQbo*Push token fetch). Here we prove end-to-end that a flag-OFF and an
// import-source push make ZERO QBO calls and never reach the push service.
import { describe, it, expect, vi, beforeEach } from "vitest";

const deliverSpy = vi.fn(async () => ({ qbo_id: "QBO-1" }));
vi.mock("../../qbo/push.service.js", () => ({
  deliverQboInvoicePush: (...a: unknown[]) => deliverSpy(...a),
}));

const isEnabledMock = vi.fn();
vi.mock("../../lib/feature-flags/service.js", () => ({ isEnabled: (...a: unknown[]) => isEnabledMock(...a) }));

import { TmsInvoicePushHandler } from "./tms-invoice-push.handler.js";

const OC = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const INV = "22222222-2222-4222-8222-222222222222";

let sourceSystem: string;
let fetchSpy: ReturnType<typeof vi.spyOn>;

function ctx() {
  return {
    client: {
      query: vi.fn(async (sql: string) => {
        if (/FROM accounting\.invoices/.test(sql)) return { rows: [{ signal: sourceSystem }] };
        return { rows: [] };
      }),
    },
    eventId: "evt-1",
    instanceId: "inst-1",
    log: vi.fn(),
  } as unknown as Parameters<TmsInvoicePushHandler["deliver"]>[1];
}

beforeEach(() => {
  vi.clearAllMocks();
  sourceSystem = "tms";
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

describe("IMPORT-P0b — invoice handler entity-push kill-switch (zero-call proof)", () => {
  const handler = new TmsInvoicePushHandler();
  const payload = { operating_company_id: OC, invoice_id: INV, operation: "create" };

  it("canHandle is a registration predicate only (always true; money gate is in deliver)", () => {
    expect(handler.canHandle()).toBe(true);
  });

  it("flag OFF → terminal skip, ZERO fetch, push service never called", async () => {
    sourceSystem = "tms";
    isEnabledMock.mockResolvedValue(false);
    const res = await handler.deliver(payload, ctx());
    expect(res).toEqual({ message: "qbo_entity_push_disabled_skip" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(deliverSpy).not.toHaveBeenCalled();
  });

  it("import-source (source_system='qbo') → refused even with flag ON, ZERO fetch, push never called", async () => {
    sourceSystem = "qbo";
    isEnabledMock.mockResolvedValue(true);
    const res = (await handler.deliver(payload, ctx())) as { message: string };
    expect(res.message.startsWith("qbo_push_refused_import_source")).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(deliverSpy).not.toHaveBeenCalled();
  });
});
