import { describe, expect, it, vi } from "vitest";
import { createLoadTransitionHookRegistry, type LoadTransitionHooks } from "../load-transition-hooks.js";

describe("load-transition leaf registry fails closed", () => {
  const hooks = (): LoadTransitionHooks => ({
    ensureDriverBillArtifactsForLoad: vi.fn(async () => ({ outcome: "already_exists" as const })),
    latchOnDeliveryEvidence: vi.fn(async () => "deferred" as const),
  });
  it("throws for unregistered hooks (never silently omits invoices)", () => {
    expect(() => createLoadTransitionHookRegistry().get()).toThrow("load_transition_hooks_unregistered");
  });
  it("refuses incomplete registration", () => {
    const registry = createLoadTransitionHookRegistry();
    expect(() => registry.register({ ...hooks(), latchOnDeliveryEvidence: undefined } as unknown as LoadTransitionHooks)).toThrow("load_transition_hooks_incomplete");
    expect(() => registry.get()).toThrow("load_transition_hooks_unregistered");
  });
  it("retains the supplied functions and refuses replacement or mutation", () => {
    const registry = createLoadTransitionHookRegistry();
    const actual = hooks();
    registry.register(actual);
    expect(registry.get().latchOnDeliveryEvidence).toBe(actual.latchOnDeliveryEvidence);
    expect(Object.isFrozen(registry.get())).toBe(true);
    expect(() => registry.register(hooks())).toThrow("load_transition_hooks_already_registered");
  });
});
