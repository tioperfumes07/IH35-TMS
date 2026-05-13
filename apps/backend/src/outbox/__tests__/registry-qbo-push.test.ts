import { describe, expect, it } from "vitest";
import { buildOutboxHandlerRegistry } from "../handlers/registry.js";

describe("outbox registry — QBO master-data push", () => {
  it("registers qbo.master_entity.push_requested", () => {
    const registry = buildOutboxHandlerRegistry();
    expect(registry.get("qbo.master_entity.push_requested")?.eventType).toBe("qbo.master_entity.push_requested");
  });
});
