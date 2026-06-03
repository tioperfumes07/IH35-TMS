import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const countModule = fs.readFileSync(path.join(here, "../../src/dispatch/active-loads-count.ts"), "utf8");
const routesModule = fs.readFileSync(path.join(here, "../../src/dispatch/loads.routes.ts"), "utf8");
const dispatchPage = fs.readFileSync(path.join(here, "../../../frontend/src/pages/Dispatch.tsx"), "utf8");

describe("dispatch active-loads-count", () => {
  it("defines canonical active and in-transit status sets", () => {
    assert.match(countModule, /DISPATCH_ACTIVE_LOAD_STATUSES/);
    assert.match(countModule, /"in_transit"/);
    assert.match(countModule, /DISPATCH_IN_TRANSIT_STATUSES/);
    assert.match(countModule, /"at_pickup"/);
    assert.match(countModule, /"at_delivery"/);
  });

  it("dashboard route returns active_loads and uses canonical in_transit counter", () => {
    assert.match(routesModule, /active_loads/);
    assert.match(routesModule, /countInTransitDispatchLoads/);
    assert.match(routesModule, /countActiveDispatchLoads/);
  });

  it("Dispatch page reads dashboard KPIs instead of paginated list for tiles", () => {
    assert.match(dispatchPage, /getDispatchDashboard/);
    assert.match(dispatchPage, /active_loads/);
    assert.match(dispatchPage, /inTransit\} in transit/);
    assert.doesNotMatch(dispatchPage, /14 in transit/);
  });
});
