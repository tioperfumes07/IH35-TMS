import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// AF-2c — regression guard for the entity-scoped legacy-catalog factory. After AF-2 put FORCE-RLS +
// NOT NULL operating_company_id on catalogs.items, the factory MUST (a) require operating_company_id,
// (b) SET the app.operating_company_id GUC so RLS + WITH CHECK pass, (c) write operating_company_id on
// INSERT, (d) scope reads/writes by it, and (e) run the optional validate() hook. Non-entity kinds must
// be untouched. Mocks auth + db so the handlers run with no real pool.

let requireAuthResult = true;
vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: (req: { user?: unknown }, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) => {
    if (!requireAuthResult) {
      reply.code(401).send({ error: "unauthorized" });
      return false;
    }
    return Boolean(req.user);
  },
}));

vi.mock("../../auth/role-helpers.js", () => ({ isCatalogWriteRole: () => true }));

let recorded: Array<{ sql: string; values?: unknown[] }> = [];
let nextRows: Array<Record<string, unknown>> = [{ id: "new-id" }];
vi.mock("../../auth/db.js", () => ({
  withCurrentUser: async (_uuid: string, fn: (c: unknown) => Promise<unknown>) =>
    fn({
      query: async (sql: string, values?: unknown[]) => {
        // Cross-tenant guard: assertCompanyMembership() SELECTs org.user_company_access. Simulate a
        // seeded membership row (rowCount 1) so the legitimate same-company call passes; not recorded
        // so the business-query assertions below are unaffected.
        if (sql.includes("user_company_access")) return { rows: [{ ok: 1 }], rowCount: 1 };
        recorded.push({ sql, values });
        return { rows: nextRows };
      },
    }),
}));

const { registerLegacyAccountingCatalogRoutes } = await import("./factory.js");

type Handler = (req: unknown, reply: unknown) => Promise<unknown>;
function captureRoutes(config: Parameters<typeof registerLegacyAccountingCatalogRoutes>[1]) {
  const handlers: Record<string, Handler> = {};
  const app = {
    get: (p: string, h: Handler) => { handlers[`GET ${p}`] = h; },
    post: (p: string, h: Handler) => { handlers[`POST ${p}`] = h; },
    patch: (p: string, h: Handler) => { handlers[`PATCH ${p}`] = h; },
    delete: (p: string, h: Handler) => { handlers[`DELETE ${p}`] = h; },
  } as never;
  registerLegacyAccountingCatalogRoutes(app, config);
  return handlers;
}

function makeReply() {
  const out: { code: number; body: unknown } = { code: 200, body: undefined };
  const reply = {
    code(n: number) { out.code = n; return reply; },
    send(b: unknown) { out.body = b; return reply; },
  };
  return { reply, out };
}

const OWNER = { uuid: "00000000-0000-4000-8000-0000000000aa", role: "Owner" };
const OC = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

const itemsLikeConfig = {
  tableName: "items",
  urlSegment: "items",
  codeColumn: "item_code",
  nameColumn: "item_name",
  descriptionColumn: "description",
  activeMode: "deactivated_at" as const,
  requiredMetadata: ["item_type"],
  entityScoped: true,
  createMapper: (m: Record<string, unknown>) => ({
    item_type: String(m.item_type ?? "Service"),
    category_id: (m.category_id as string | null | undefined) ?? null,
    default_income_account_id: (m.default_income_account_id as string | null | undefined) ?? null,
  }),
  validate: async (
    _c: unknown,
    mapped: Record<string, unknown>,
  ): Promise<string | null> => (mapped.default_income_account_id === "bad" ? "income_account_wrong_type" : null),
};

const POST = "POST /api/v1/catalogs/accounting/items";
const GET = "GET /api/v1/catalogs/accounting/items";

describe("legacy accounting catalog factory — entityScoped (AF-2c)", () => {
  beforeEach(() => { requireAuthResult = true; recorded = []; nextRows = [{ id: "new-id" }]; });

  it("POST 400s when operating_company_id is missing on an entity-scoped kind", async () => {
    const h = captureRoutes(itemsLikeConfig);
    const { reply, out } = makeReply();
    await h[POST]({ user: OWNER, query: {}, body: { code: "X", display_name: "X", metadata: { item_type: "Service" } } }, reply);
    expect(out.code).toBe(400);
    expect((out.body as { error: string }).error).toBe("operating_company_id_required");
    expect(recorded).toHaveLength(0);
  });

  it("POST sets the GUC, writes operating_company_id, and carries category_id through the mapper", async () => {
    const h = captureRoutes(itemsLikeConfig);
    const { reply, out } = makeReply();
    await h[POST](
      { user: OWNER, query: { operating_company_id: OC }, body: { code: "SVC", display_name: "Line Haul", metadata: { item_type: "Service", category_id: "cat-1" } } },
      reply
    );
    expect(out.code).toBe(201);
    const guc = recorded.find((r) => r.sql.includes("set_config('app.operating_company_id'"));
    expect(guc?.values).toEqual([OC]);
    const insert = recorded.find((r) => r.sql.includes("INSERT INTO catalogs.items"));
    expect(insert?.sql).toContain("operating_company_id");
    expect(insert?.values).toContain(OC); // opco written on the row
    expect(insert?.values).toContain("cat-1"); // category_id persisted
  });

  it("POST runs validate() and 400s on a wrong-type account without inserting", async () => {
    const h = captureRoutes(itemsLikeConfig);
    const { reply, out } = makeReply();
    await h[POST](
      { user: OWNER, query: { operating_company_id: OC }, body: { code: "SVC", display_name: "Bad", metadata: { item_type: "Service", default_income_account_id: "bad" } } },
      reply
    );
    expect(out.code).toBe(400);
    expect((out.body as { error: string }).error).toBe("income_account_wrong_type");
    expect(recorded.some((r) => r.sql.includes("INSERT INTO"))).toBe(false);
  });

  it("GET list sets the GUC and scopes the query by operating_company_id", async () => {
    nextRows = [];
    const h = captureRoutes(itemsLikeConfig);
    const { reply } = makeReply();
    await h[GET]({ user: OWNER, query: { operating_company_id: OC } }, reply);
    expect(recorded.some((r) => r.sql.includes("set_config('app.operating_company_id'"))).toBe(true);
    expect(recorded.some((r) => r.sql.includes("t.operating_company_id = $"))).toBe(true);
  });

  it("every entity-scoped legacy catalog kind (accounts/classes/items) sets entityScoped in index.ts", () => {
    // Guard: catalogs.accounts (AF-1), catalogs.classes (AF-3), catalogs.items (AF-2) are per-entity
    // under FORCE-RLS. Their legacy factory registrations MUST set entityScoped:true or the routes leak
    // across entities / 500 on create. This catches a future entity-scoped kind that forgets the flag.
    const src = readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8");
    for (const table of ["accounts", "classes", "items"]) {
      // find the config object opened by `tableName: "<table>"` and assert entityScoped:true before the next tableName
      const start = src.indexOf(`tableName: "${table}"`);
      expect(start, `config for ${table} not found`).toBeGreaterThan(-1);
      const nextTable = src.indexOf("tableName:", start + 1);
      const block = src.slice(start, nextTable === -1 ? undefined : nextTable);
      expect(block, `${table} config must set entityScoped: true`).toMatch(/entityScoped:\s*true/);
    }
  });

  it("non-entity kind is untouched: no GUC, no operating_company_id column on insert", async () => {
    const h = captureRoutes({
      tableName: "payment_terms",
      urlSegment: "payment-terms",
      codeColumn: "term_code",
      nameColumn: "term_name",
      descriptionColumn: "description",
      activeMode: "is_active" as const,
    });
    const { reply, out } = makeReply();
    await h["POST /api/v1/catalogs/accounting/payment-terms"]({ user: OWNER, query: {}, body: { code: "NET30", display_name: "Net 30" } }, reply);
    expect(out.code).toBe(201);
    expect(recorded.some((r) => r.sql.includes("set_config('app.operating_company_id'"))).toBe(false);
    const insert = recorded.find((r) => r.sql.includes("INSERT INTO catalogs.payment_terms"));
    expect(insert?.sql).not.toContain("operating_company_id");
  });
});
