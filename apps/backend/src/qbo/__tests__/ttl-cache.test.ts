import { describe, expect, it } from "vitest";
import { createTtlCache } from "../../lib/ttl-cache.js";

describe("ttl-cache (sync health / reports)", () => {
  it("expires entries after ttl", async () => {
    const cache = createTtlCache<string>();
    cache.set("k", "v", 5);
    expect(cache.get("k")).toBe("v");
    await new Promise((r) => setTimeout(r, 15));
    expect(cache.get("k")).toBeUndefined();
  });
});
