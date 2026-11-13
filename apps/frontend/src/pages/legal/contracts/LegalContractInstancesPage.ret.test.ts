import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "./LegalContractInstancesPage.tsx"), "utf8");

describe("ROUND 8.20 board21 — Contracts Back honors ?ret=", () => {
  it("resolves Back from ret (does not hard-code /legal alone)", () => {
    expect(source).toMatch(/resolveBackHref/);
    expect(source).toMatch(/contractsBackHref/);
    expect(source).toMatch(/backHref=\{contractsBackHref\}/);
    expect(source).not.toMatch(/backHref="\/legal"/);
  });
});
