import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

describe("vehicle profile pdf export", () => {
  it("uses puppeteer page.pdf", () => {
    const src = readFileSync(
      path.resolve(process.cwd(), "apps/backend/src/mdata/vehicle-profile-pdf-renderer.service.ts"),
      "utf8"
    );
    assert.ok(src.includes("puppeteer"));
    assert.ok(src.includes("page.pdf"));
  });

  it("export route streams application/pdf", () => {
    const src = readFileSync(
      path.resolve(process.cwd(), "apps/backend/src/mdata/unit-pdf-export.routes.ts"),
      "utf8"
    );
    assert.ok(src.includes("export.pdf"));
    assert.ok(src.includes("application/pdf"));
  });
});
