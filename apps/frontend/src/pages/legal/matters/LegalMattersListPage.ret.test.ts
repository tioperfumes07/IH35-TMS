import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "./LegalMattersListPage.tsx"), "utf8");

describe("ROUND 8.20 board21 — Matters Back honors ?ret=", () => {
  it("resolves Back from ret (does not hard-code /legal alone)", () => {
    expect(source).toMatch(/resolveBackHref/);
    expect(source).toMatch(/mattersBackHref/);
    expect(source).toMatch(/backHref=\{mattersBackHref\}/);
    expect(source).not.toMatch(/backHref="\/legal"/);
  });
});
