import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const renderer = fs.readFileSync(
  path.join(here, "../../src/mdata/driver-profile-pdf-renderer.service.ts"),
  "utf8"
);
const routes = fs.readFileSync(path.join(here, "../../src/mdata/driver-pdf-export.routes.ts"), "utf8");

describe("driver pdf export", () => {
  it("uses puppeteer page.pdf and export route", () => {
    assert.match(renderer, /page\.pdf/);
    assert.match(routes, /export\.pdf/);
    assert.match(routes, /buildDriverAggregate/);
  });
});
