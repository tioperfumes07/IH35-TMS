import { describe, expect, it, vi, beforeEach } from "vitest";
import { readVapidPublicKeyFromEnv } from "./push-permission";

describe("push-permission", () => {
  beforeEach(() => {
    vi.stubGlobal("Notification", { requestPermission: vi.fn().mockResolvedValue("denied") });
  });

  it("reads empty vapid when env unset", () => {
    expect(readVapidPublicKeyFromEnv()).toBe("");
  });
});
