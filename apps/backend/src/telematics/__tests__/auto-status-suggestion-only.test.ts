import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("auto status suggestion only", () => {
  it("does not directly update mdata.loads status", () => {
    const file = "apps/backend/src/telematics/auto-status.service.ts";
    const content = fs.readFileSync(file, "utf8");
    expect(content).not.toMatch(/UPDATE\s+mdata\.loads\s+SET\s+status/i);
    expect(content).toContain("INSERT INTO dispatch.auto_status_suggestions");
  });
});
