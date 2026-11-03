import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseTemplateStatusFilter } from "../templates.service.js";

const company = "11111111-1111-4111-8111-111111111111";
const db = vi.hoisted(() => ({ query: vi.fn(async () => ({ rows: [] })) }));

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: async (_id: string, fn: (c: typeof db) => unknown) => fn(db),
}));
vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: () => true }));

import { registerLegalTemplateRoutes } from "../templates.routes.js";

describe("parseTemplateStatusFilter — Codex batch67 sibling", () => {
  it("parses comma-union and drops unknown tokens", () => {
    expect(parseTemplateStatusFilter("draft,active,draft,bogus,retired")).toEqual([
      "draft",
      "active",
      "retired",
    ]);
  });

  it("returns empty for blank input", () => {
    expect(parseTemplateStatusFilter(undefined)).toEqual([]);
    expect(parseTemplateStatusFilter("")).toEqual([]);
  });
});

describe("GET /api/v1/legal/templates status — Codex batch71 HTTP boundary", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    db.query.mockClear();
    db.query.mockResolvedValue({ rows: [] });
    app = Fastify();
    app.addHook("preHandler", async (req) => {
      req.user = { uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", role: "Owner" } as never;
    });
    await registerLegalTemplateRoutes(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it("accepts a single allowlisted status and reaches the DB", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/legal/templates?operating_company_id=${company}&status=draft`,
    });
    expect(res.statusCode).toBe(200);
    const listCall = db.query.mock.calls.find(([sql]) => String(sql).includes("FROM legal.contract_templates"));
    expect(listCall).toBeTruthy();
    expect(String(listCall![0])).toMatch(/status\s*=\s*\$\d+::legal\.contract_template_status/);
    expect(listCall![1]).toEqual([company, "draft"]);
  });

  it("accepts allowlisted comma-union and applies ANY() before LIMIT", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/legal/templates?operating_company_id=${company}&status=draft,active`,
    });
    expect(res.statusCode).toBe(200);
    const listCall = db.query.mock.calls.find(([sql]) => String(sql).includes("FROM legal.contract_templates"));
    expect(listCall).toBeTruthy();
    expect(String(listCall![0])).toMatch(/status\s*=\s*ANY\(\$\d+::legal\.contract_template_status\[\]\)/);
    expect(listCall![1]).toEqual([company, ["draft", "active"]]);
  });

  it("rejects invalid status tokens at the route (no DB list read)", async () => {
    const before = db.query.mock.calls.length;
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/legal/templates?operating_company_id=${company}&status=not_a_status`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "validation_error" });
    const listReads = db.query.mock.calls
      .slice(before)
      .filter(([sql]) => String(sql).includes("FROM legal.contract_templates"));
    expect(listReads).toHaveLength(0);
  });

  it("rejects mixed allowlisted+junk unions at the route", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/legal/templates?operating_company_id=${company}&status=draft,bogus`,
    });
    expect(res.statusCode).toBe(400);
  });
});
