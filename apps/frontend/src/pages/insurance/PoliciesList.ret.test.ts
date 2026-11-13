import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "./PoliciesList.tsx"), "utf8");

describe("ROUND 8.20 board20 — Policies list Back honors ?ret=", () => {
  it("resolves Back from ret (does not hard-code /insurance alone)", () => {
    expect(source).toMatch(/resolveBackHref/);
    expect(source).toMatch(/policiesBackHref/);
    expect(source).toMatch(/backHref=\{policiesBackHref\}/);
    expect(source).not.toMatch(/backHref="\/insurance"/);
  });
});
