import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/pages/accounting/AccountingSubNavWrapper.tsx"), "utf8");

describe("ROUND 8.20 board1 Accounting list Backs honor ?ret=", () => {
  it("AccountingSubNavWrapper resolves Accounting crumb from ret (no hard-coded /accounting alone)", () => {
    expect(source).toMatch(/resolveBackHref/);
    expect(source).toMatch(/accountingBackHref/);
    expect(source).toMatch(/href: accountingBackHref/);
    // Hard-coded crumb target would drop hub Open-bills ret.
    expect(source).not.toMatch(/\{\s*label:\s*"Accounting",\s*href:\s*"\/accounting"\s*\}/);
  });
});
