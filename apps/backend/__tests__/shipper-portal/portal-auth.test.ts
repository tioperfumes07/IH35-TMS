import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("shipper portal auth routes", () => {
  it("registers portal auth endpoints", () => {
    const src = fs.readFileSync(path.join(here, "../../src/shipper-portal/portal-auth.routes.ts"), "utf8");
    assert.match(src, /\/api\/v1\/portal\/auth\/login/);
    assert.match(src, /\/api\/v1\/portal\/auth\/logout/);
    assert.match(src, /\/api\/v1\/portal\/auth\/forgot-password/);
    assert.match(src, /\/api\/v1\/portal\/auth\/reset-password/);
    assert.match(src, /Argon2id/);
    assert.match(src, /registerShipperPortalRoutes/);
  });
});

describe("shipper portal migration", () => {
  it("defines portal schema objects", () => {
    const sql = fs.readFileSync(path.join(here, "../../../../db/migrations/0306_shipper_portal_mvp.sql"), "utf8");
    assert.match(sql, /shipper_portal\.portal_users/);
    assert.match(sql, /shipper_portal\.portal_sessions/);
    assert.match(sql, /shipper_portal\.load_milestones/);
  });
});
