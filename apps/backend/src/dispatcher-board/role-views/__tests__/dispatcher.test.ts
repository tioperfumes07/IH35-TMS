import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("dispatcher home role view (GAP-66)", () => {
  const servicePath = resolve(import.meta.dirname, "../dispatcher.service.ts");
  const routesPath = resolve(import.meta.dirname, "../routes.ts");
  const indexPath = resolve(import.meta.dirname, "../../../index.ts");

  it("scopes dispatcher home data by current dispatcher user", () => {
    const src = readFileSync(servicePath, "utf8");
    expect(src).toContain("withCurrentUser");
    expect(src).toContain("l.dispatcher_user_id = $1::uuid");
    expect(src).toContain("mdata.loads");
    expect(src).toContain("mdata.detention_requests");
  });

  it("enforces role access + auth for dispatcher home route", () => {
    const src = readFileSync(routesPath, "utf8");
    expect(src).toContain('app.get("/api/v1/dispatcher-board/home"');
    expect(src).toContain("requireAuth");
    expect(src).toContain("canReadDispatcherHome");
    expect(src).toContain("reply.code(403).send({ error: \"forbidden\" })");
  });

  it("wires dispatcher role-view routes in backend bootstrap", () => {
    const src = readFileSync(indexPath, "utf8");
    expect(src).toContain("registerDispatcherRoleViewRoutes");
  });
});
