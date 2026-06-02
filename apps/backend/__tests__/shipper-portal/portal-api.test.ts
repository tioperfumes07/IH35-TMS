import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("shipper portal api routes", () => {
  it("registers customer-scoped portal load endpoints", () => {
    const src = fs.readFileSync(path.join(here, "../../src/shipper-portal/portal-api.routes.ts"), "utf8");
    assert.match(src, /\/api\/v1\/portal\/loads/);
    assert.match(src, /\/api\/v1\/portal\/loads\/:id\/documents/);
    assert.match(src, /\/api\/v1\/portal\/loads\/:id\/tracking-stream/);
    assert.match(src, /\/api\/v1\/portal\/profile/);
    assert.match(src, /customer_id = \$2::uuid/);
    assert.match(src, /telematics\.vehicle_latest_position/);
  });
});
