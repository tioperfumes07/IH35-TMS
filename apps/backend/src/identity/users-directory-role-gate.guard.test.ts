import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";

// USERS-2 static guard: the full user directory read (GET /api/v1/identity/users) must stay role-gated
// so it can never regress to being readable by ANY authenticated role (the original finding — a Driver
// could enumerate every user). We assert, at the source level, that the list handler carries the admin
// gate and that the minimal assignee-picker endpoint (which non-admin roles use instead) exists and is
// closed to Driver — so a refactor can't silently drop either guard.
const here = dirname(fileURLToPath(import.meta.url));
const routes = readFileSync(resolve(here, "users.routes.ts"), "utf8");

// The block of the list handler, from its registration up to (but not including) the assignable route.
function listHandlerBlock(src: string): string {
  const start = src.indexOf('app.get("/api/v1/identity/users",');
  const end = src.indexOf('app.get("/api/v1/identity/users/assignable"');
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe("USERS-2 user directory list is role-gated", () => {
  it("the full directory list handler rejects non-admin roles with a 403 before querying", () => {
    const block = listHandlerBlock(routes);
    // An admin-role gate that short-circuits to 403 must appear in the list handler.
    expect(block).toMatch(/if \(!isAdminRole\(authUser\.role\)\) \{[\s\S]*?reply\.code\(403\)/);
  });

  it("the admin gate lands before any identity.users SELECT in the list handler", () => {
    const block = listHandlerBlock(routes);
    const gateIdx = block.indexOf("isAdminRole(authUser.role)");
    const selectIdx = block.indexOf("FROM identity.users");
    expect(gateIdx).toBeGreaterThanOrEqual(0);
    expect(selectIdx).toBeGreaterThan(gateIdx);
  });

  it("isAdminRole restricts to Owner/Administrator only", () => {
    expect(routes).toMatch(/return role === "Owner" \|\| role === "Administrator";/);
  });
});

describe("USERS-2 minimal assignee endpoint exists and excludes Driver + auth-sensitive fields", () => {
  const start = routes.indexOf('app.get("/api/v1/identity/users/assignable"');
  const block = routes.slice(start, routes.indexOf('app.get("/api/v1/identity/users/:id"', start));

  it("registers the assignable route", () => {
    expect(start).toBeGreaterThanOrEqual(0);
  });

  it("closes the assignable list to Driver", () => {
    expect(block).toMatch(/if \(authUser\.role === "Driver"\) \{[\s\S]*?reply\.code\(403\)/);
  });

  it("never selects auth-sensitive fields (password_hash / google_user_id / last_login_at)", () => {
    expect(block).not.toContain("password_hash");
    expect(block).not.toContain("google_user_id");
    expect(block).not.toContain("last_login_at");
  });

  it("returns only active users", () => {
    expect(block).toContain("u.deactivated_at IS NULL");
  });
});
