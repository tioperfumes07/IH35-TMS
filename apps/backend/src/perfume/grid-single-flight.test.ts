// Owner 2026-11-15 20:15 CT "i need speed": requests that arrive while the grid is cold share ONE build (measured 02:15Z:
// four parallel builds, 41 s each).
import { describe, expect, it } from "vitest";
import { buildGrid, invalidateGridCache } from "./desk.service.js";

describe("buildGrid single flight", () => {
  it("concurrent cold requests run the build once and get the same payload", async () => {
    invalidateGridCache();
    let reads = 0;
    const client = { query: async (sql: string) => { if (/FROM perfume\\.items|perfume\.items/.test(sql)) reads++; await new Promise((r) => setTimeout(r, 1)); return { rows: [], rowCount: 0 }; } };
    const [a, b, c] = await Promise.all([buildGrid(client as never), buildGrid(client as never), buildGrid(client as never)]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    const once = reads;
    invalidateGridCache();
    reads = 0;
    await buildGrid(client as never);
    expect(once).toBe(reads); // three concurrent requests read exactly what one build reads
  });
});
