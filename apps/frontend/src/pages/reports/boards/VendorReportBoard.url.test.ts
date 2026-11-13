import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ROUND 8.20 board31 — Vendor report URL SoT", () => {
  const source = readFileSync(resolve(__dirname, "./VendorReportBoard.tsx"), "utf8");

  it("hydrates view/range/vendors from searchParams and attaches ret on drills", () => {
    expect(source).toMatch(/useSearchParams/);
    expect(source).toMatch(/searchParams\.get\("view"\)/);
    expect(source).toMatch(/searchParams\.get\("range"\)/);
    expect(source).toMatch(/withReturnContext/);
  });
});
