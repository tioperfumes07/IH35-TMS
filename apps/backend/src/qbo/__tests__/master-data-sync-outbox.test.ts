import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("master-data sync outbox emissions", () => {
  it("does not emit qbo.mdata.*.synced outbox events", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const filePath = path.resolve(here, "../master-data-sync.service.ts");
    const source = readFileSync(filePath, "utf8");
    expect(source).not.toContain("qbo.mdata.${entity}.synced");
    expect(source).not.toContain("qbo.mdata.vendor.synced");
    expect(source).not.toContain("qbo.mdata.customer.synced");
    expect(source).not.toContain("qbo.mdata.item.synced");
    expect(source).not.toContain("qbo.mdata.account.synced");
  });
});
