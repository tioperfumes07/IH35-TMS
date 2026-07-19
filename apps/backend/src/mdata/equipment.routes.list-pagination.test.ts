import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerEquipmentRoutes } from "./equipment.routes.js";

const COMPANY_A = "11111111-1111-4111-8111-111111111111";
const COMPANY_B = "22222222-2222-4222-8222-222222222222";
const FOREIGN_COMPANY = "33333333-3333-4333-8333-333333333333";

const requireAuthState = { allowed: true };

type EquipmentRow = {
  id: string;
  equipment_number: string;
  status: string;
  owner_company_id: string;
  currently_leased_to_company_id: string | null;
  created_at: string;
};

const ALL_ROWS: EquipmentRow[] = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    equipment_number: "TR-100",
    status: "InService",
    owner_company_id: COMPANY_A,
    currently_leased_to_company_id: COMPANY_A,
    created_at: "2026-07-19T12:00:00.000Z",
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    equipment_number: "TR-101",
    status: "InService",
    owner_company_id: COMPANY_A,
    currently_leased_to_company_id: COMPANY_A,
    created_at: "2026-07-19T12:00:00.000Z",
  },
  {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    equipment_number: "TR-200",
    status: "OutOfService",
    owner_company_id: COMPANY_A,
    currently_leased_to_company_id: COMPANY_A,
    created_at: "2026-07-18T12:00:00.000Z",
  },
  {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    equipment_number: "TR-FOREIGN",
    status: "InService",
    owner_company_id: COMPANY_B,
    currently_leased_to_company_id: COMPANY_B,
    created_at: "2026-07-19T13:00:00.000Z",
  },
  // Leased-only into COMPANY_A: owner is COMPANY_B, lessee is COMPANY_A — must appear for A.
  {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    equipment_number: "TR-LEASED-IN",
    status: "InService",
    owner_company_id: COMPANY_B,
    currently_leased_to_company_id: COMPANY_A,
    created_at: "2026-07-17T12:00:00.000Z",
  },
  // Foreign owner, unleased to COMPANY_A — must NOT appear for A.
  {
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    equipment_number: "TR-FOREIGN-UNLEASED",
    status: "InService",
    owner_company_id: COMPANY_B,
    currently_leased_to_company_id: null,
    created_at: "2026-07-19T14:00:00.000Z",
  },
];

function scopedRows(companyId: string, status?: string, search?: string): EquipmentRow[] {
  return ALL_ROWS.filter((row) => {
    const inScope =
      row.owner_company_id === companyId || row.currently_leased_to_company_id === companyId;
    if (!inScope) return false;
    if (status && row.status !== status) return false;
    if (search) {
      const needle = search.replace(/%/g, "").toLowerCase();
      if (!row.equipment_number.toLowerCase().includes(needle)) return false;
    }
    return true;
  }).sort((a, b) => {
    const byCreated = b.created_at.localeCompare(a.created_at);
    if (byCreated !== 0) return byCreated;
    return a.id.localeCompare(b.id);
  });
}

/** Param layout after entity-scope refactor: [companyId, status?, search?, limit?, offset?] */
function parseListParams(sql: string, params: unknown[] | undefined) {
  const text = String(sql);
  const companyId = String(params?.[0] ?? "");
  let status: string | undefined;
  let search: string | undefined;
  if (text.includes("status = $") && text.includes("ILIKE")) {
    status = String(params?.[1]);
    search = String(params?.[2]);
  } else if (text.includes("status = $")) {
    status = String(params?.[1]);
  } else if (text.includes("ILIKE")) {
    search = String(params?.[1]);
  }
  return { companyId, status, search };
}

const queryMock = vi.fn(async (sql: string, params?: unknown[]) => {
  const text = String(sql);

  // G1-6 membership gate for an explicit operating_company_id.
  if (text.includes("c.id IN (SELECT org.user_accessible_company_ids())") && text.includes("c.id = $1")) {
    const requested = String(params?.[0] ?? "");
    if (requested === COMPANY_A || requested === COMPANY_B) {
      return { rows: [{ id: requested }] };
    }
    return { rows: [] };
  }

  // Default company resolution when operating_company_id is omitted.
  if (text.includes("COALESCE(") && text.includes("default_company_id")) {
    return { rows: [{ id: COMPANY_A }] };
  }

  if (text.includes("set_config('app.operating_company_id'")) {
    return { rows: [] };
  }

  if (/count\(\*\)\s*::int\s+AS\s+total\s+FROM\s+mdata\.equipment/i.test(text)) {
    expect(text).toContain("owner_company_id = $1 OR currently_leased_to_company_id = $1");
    const { companyId, status, search } = parseListParams(text, params);
    const rows = scopedRows(companyId, status, search);
    return { rows: [{ total: rows.length }] };
  }

  if (text.includes("FROM mdata.equipment") && text.includes("ORDER BY")) {
    expect(text).toContain("owner_company_id = $1 OR currently_leased_to_company_id = $1");
    const limit = Number(params?.[params.length - 2] ?? 50);
    const offset = Number(params?.[params.length - 1] ?? 0);
    const { companyId, status, search } = parseListParams(text, params);
    const rows = scopedRows(companyId, status, search).slice(offset, offset + limit);
    return { rows };
  }

  return { rows: [] };
});

vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: (
    _req: unknown,
    reply: { code: (statusCode: number) => { send: (body: unknown) => void } }
  ) => {
    if (requireAuthState.allowed) return true;
    reply.code(401).send({ error: "unauthorized" });
    return false;
  },
}));

vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

vi.mock("./equipment-plates.routes.js", () => ({
  registerEquipmentPlatesRoutes: async () => undefined,
}));

vi.mock("./equipment-pdf-export.routes.js", () => ({
  registerEquipmentPdfExportRoutes: async () => undefined,
}));

vi.mock("../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async () => undefined),
  buildPatchChanges: vi.fn(() => ({})),
}));

describe("GET /api/v1/mdata/equipment list pagination contract (0091-g9-h6)", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  beforeEach(() => {
    requireAuthState.allowed = true;
    queryMock.mockClear();
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function buildApp(role = "Dispatcher") {
    const app = Fastify();
    apps.push(app);
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string; role: string } }).user = {
        uuid: "99999999-9999-4999-8999-999999999999",
        role,
      };
    });
    await registerEquipmentRoutes(app);
    return app;
  }

  it("returns 401 when unauthenticated", async () => {
    requireAuthState.allowed = false;
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/equipment?operating_company_id=${COMPANY_A}`,
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects a foreign operating_company_id with 403 (company scope)", async () => {
    const app = await buildApp("Owner");
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/equipment?operating_company_id=${FOREIGN_COMPANY}`,
    });
    expect(response.statusCode).toBe(403);
  });

  it("counts the same filtered/scoped dataset as items and derives has_more", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/equipment?operating_company_id=${COMPANY_A}&status=InService&limit=1&offset=0`,
    });

    expect(response.statusCode).toBe(200);
    // COMPANY_A InService: TR-100, TR-101, TR-LEASED-IN → total 3
    expect(response.json()).toMatchObject({
      total: 3,
      limit: 1,
      offset: 0,
      has_more: true,
      equipment: [{ equipment_number: "TR-100" }],
    });

    const countCall = queryMock.mock.calls.find(([sql]) =>
      /count\(\*\)\s*::int\s+AS\s+total\s+FROM\s+mdata\.equipment/i.test(String(sql))
    );
    expect(countCall).toBeDefined();
    expect(String(countCall?.[0])).toContain("status = $");
    expect(String(countCall?.[0])).toContain(
      "owner_company_id = $1 OR currently_leased_to_company_id = $1"
    );
    // Count must not page — LIMIT/OFFSET belong only on the item SELECT.
    expect(String(countCall?.[0])).not.toMatch(/\bLIMIT\b/i);
    expect(String(countCall?.[0])).not.toMatch(/\bOFFSET\b/i);
    // Bind layout: [$1=company, $2=status]
    expect(countCall?.[1]).toEqual([COMPANY_A, "InService"]);
    expect(String(countCall?.[0])).not.toMatch(/mdata\.equipment\.operating_company_id/);

    const listCall = queryMock.mock.calls.find(
      ([sql]) => String(sql).includes("FROM mdata.equipment") && String(sql).includes("ORDER BY")
    );
    expect(String(listCall?.[0])).toContain(
      "owner_company_id = $1 OR currently_leased_to_company_id = $1"
    );
    expect(listCall?.[1]).toEqual([COMPANY_A, "InService", 1, 0]);
  });

  it("includes leased-only trailers (owner different, currently_leased_to selected company)", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/equipment?operating_company_id=${COMPANY_A}&search=LEASED-IN&limit=50&offset=0`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      total: 1,
      has_more: false,
      equipment: [
        {
          equipment_number: "TR-LEASED-IN",
          owner_company_id: COMPANY_B,
          currently_leased_to_company_id: COMPANY_A,
        },
      ],
    });
  });

  it("excludes foreign-owned unleased trailers from the selected company scope", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/equipment?operating_company_id=${COMPANY_A}&limit=50&offset=0`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      total: number;
      equipment: Array<{ equipment_number: string; id: string }>;
    };
    // Owned by A (3) + leased-in (1) = 4; foreign unleased + foreign owned/leased-to-B excluded.
    expect(body.total).toBe(4);
    const numbers = body.equipment.map((r) => r.equipment_number);
    expect(numbers).toContain("TR-LEASED-IN");
    expect(numbers).not.toContain("TR-FOREIGN");
    expect(numbers).not.toContain("TR-FOREIGN-UNLEASED");
  });

  it("honors offset/limit for the middle page", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/equipment?operating_company_id=${COMPANY_A}&limit=1&offset=1`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      total: number;
      limit: number;
      offset: number;
      has_more: boolean;
      equipment: Array<{ id: string }>;
    };
    expect(body).toMatchObject({ total: 4, limit: 1, offset: 1, has_more: true });
    expect(body.equipment).toHaveLength(1);
    expect(body.equipment[0]?.id).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  });

  it("marks the final page has_more=false", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/equipment?operating_company_id=${COMPANY_A}&limit=2&offset=2`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      total: 4,
      limit: 2,
      offset: 2,
      has_more: false,
    });
    const ids = (response.json() as { equipment: Array<{ id: string }> }).equipment.map((r) => r.id);
    expect(ids).toEqual([
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    ]);
  });

  it("returns an empty page with truthful total/has_more when offset is past the end", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/equipment?operating_company_id=${COMPANY_A}&limit=10&offset=100`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      equipment: [],
      total: 4,
      limit: 10,
      offset: 100,
      has_more: false,
    });
  });

  it("applies search filter to both count and page items", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/equipment?operating_company_id=${COMPANY_A}&search=TR-10&limit=50&offset=0`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      total: number;
      has_more: boolean;
      equipment: Array<{ equipment_number: string }>;
    };
    expect(body.total).toBe(2);
    expect(body.has_more).toBe(false);
    expect(body.equipment.map((r) => r.equipment_number).sort()).toEqual(["TR-100", "TR-101"]);

    const countCall = queryMock.mock.calls.find(([sql]) =>
      /count\(\*\)\s*::int\s+AS\s+total\s+FROM\s+mdata\.equipment/i.test(String(sql))
    );
    expect(countCall?.[1]).toEqual([COMPANY_A, "%TR-10%"]);
  });

  it("uses a deterministic created_at DESC, id ASC tie-breaker", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/equipment?operating_company_id=${COMPANY_A}&limit=50&offset=0`,
    });

    expect(response.statusCode).toBe(200);
    const listCall = queryMock.mock.calls.find(
      ([sql]) => String(sql).includes("FROM mdata.equipment") && String(sql).includes("ORDER BY")
    );
    expect(listCall?.[0]).toContain("ORDER BY created_at DESC, id ASC");

    const ids = (response.json() as { equipment: Array<{ id: string }> }).equipment.map((r) => r.id);
    // Same created_at for TR-100/TR-101 → id ASC puts aaaa… before bbbb…
    expect(ids.slice(0, 2)).toEqual([
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    ]);
  });

  it("does not invent operating_company_id on mdata.equipment SQL", async () => {
    const app = await buildApp();
    await app.inject({
      method: "GET",
      url: `/api/v1/mdata/equipment?operating_company_id=${COMPANY_A}`,
    });

    const equipmentSql = queryMock.mock.calls
      .map(([sql]) => String(sql))
      .filter((sql) => sql.includes("FROM mdata.equipment"));
    expect(equipmentSql.length).toBeGreaterThan(0);
    for (const sql of equipmentSql) {
      expect(sql).not.toMatch(/equipment\.operating_company_id|FROM mdata\.equipment[\s\S]*operating_company_id\s*=/);
      expect(sql).toContain("owner_company_id = $1");
      expect(sql).toContain("currently_leased_to_company_id = $1");
    }
  });
});
