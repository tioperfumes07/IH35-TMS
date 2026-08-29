import { describe, expect, it } from "vitest";
import { buildOutboxHandlerRegistry, buildUniqueOutboxHandlerMap } from "../handlers/registry.js";

describe("outbox registry — QBO master-data push", () => {
  it("registers qbo.master_entity.push_requested", () => {
    const registry = buildOutboxHandlerRegistry();
    expect(registry.get("qbo.master_entity.push_requested")?.eventType).toBe("qbo.master_entity.push_requested");
  });

  it("fails startup loudly when two handlers claim the same event type", () => {
    const handler = {
      eventType: "duplicate.test",
      canHandle: () => true,
      deliver: async () => ({ message: "ok" }),
    };
    expect(() => buildUniqueOutboxHandlerMap([handler, { ...handler }])).toThrow(
      "duplicate_outbox_handler:duplicate.test",
    );
  });
});
