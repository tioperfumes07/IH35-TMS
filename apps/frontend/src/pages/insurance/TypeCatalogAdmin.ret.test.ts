import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "./TypeCatalogAdmin.tsx"), "utf8");

describe("ROUND 8.20 board20 — Type catalog Back honors ?ret=", () => {
  it("resolves Back from ret (does not hard-code /insurance alone)", () => {
    expect(source).toMatch(/resolveBackHref/);
    expect(source).toMatch(/typeCatalogBackHref/);
    expect(source).toMatch(/backHref=\{typeCatalogBackHref\}/);
    expect(source).not.toMatch(/backHref="\/insurance"/);
  });
});
