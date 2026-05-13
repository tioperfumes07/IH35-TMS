import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("qbo autocomplete routes (static guarantees)", () => {
  it("keeps LIMIT 25 guardrails in route module source", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const routesPath = path.resolve(here, "../qbo-autocomplete.routes.ts");
    const src = readFileSync(routesPath, "utf8");
    const hits = src.match(/LIMIT 25/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(4);
  });
});
