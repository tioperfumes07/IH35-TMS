import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("shipper portal isolation", () => {
  it("wires portal routes from form-425c bootstrap without index.ts edits", () => {
    const form425 = fs.readFileSync(path.join(here, "../../src/compliance/form-425c.routes.ts"), "utf8");
    assert.match(form425, /registerShipperPortalRoutes/);
  });

  it("uses separate portal session cookie from office auth", () => {
    const session = fs.readFileSync(path.join(here, "../../src/shipper-portal/portal-session.middleware.ts"), "utf8");
    assert.match(session, /PORTAL_SESSION_COOKIE = "portal_session"/);
    assert.match(session, /internal_session_not_valid_for_portal/);
  });

  it("load milestone service can notify portal users", () => {
    const svc = fs.readFileSync(path.join(here, "../../src/shipper-portal/load-milestone.service.ts"), "utf8");
    assert.match(svc, /processPendingMilestoneEmails/);
    assert.match(svc, /portal-dispatched/);
  });
});
