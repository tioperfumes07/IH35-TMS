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
    // Three SQL branches still own LIMIT 25 directly: vendors, items, and accounts.
    // Customers now use shared canonical autocomplete with limit passed as an argument.
    expect(hits.length).toBe(3);
  });
});
