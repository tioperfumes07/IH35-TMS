import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerRequiredDocumentTypesRoutes } from "./required-documents.routes.js";

const OPCO = "11111111-1111-4111-8111-111111111111";
let lastScopedOpco: string | null = null;

const queryMock = vi.fn(async (sql: string, values?: unknown[]) => {
  if (sql.includes("set_config") && sql.includes("app.operating_company_id")) {
    lastScopedOpco = String(values?.[0] ?? "");
    return { rows: [] };
  }
  if (sql.includes("SELECT") && sql.includes("FROM compliance.required_document_types")) {
    return {
      rows: [
        { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", entity_kind: "driver", code: "cdl", label: "Commercial Driver License", enforcement: "warn", has_expiry: true, is_seed: true, sort_order: 10 },
      ],
    };
  }
  if (sql.includes("INSERT INTO compliance.required_document_types")) {
    return { rows: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", entity_kind: "driver", code: "custom_form", label: "Custom Form", enforcement: "warn", has_expiry: false, is_seed: false, sort_order: 99 }] };
  }
  if (sql.includes("UPDATE compliance.required_document_types")) {
    return { rows: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", entity_kind: "driver", code: "cdl", label: "Commercial Driver License", enforcement: "hard_block", has_expiry: true, is_active: true, sort_order: 10 }] };
  }
  return { rows: [] };
});

vi.mock("../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));
vi.mock("../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));

describe("required-document-types routes (DOC-REQ-2)", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    queryMock.mockClear();
    lastScopedOpco = null;
  });

  async function buildApp(role: string) {
    const app = Fastify();
    apps.push(app);
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string; role: string } }).user = { uuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", role };
    });
    await registerRequiredDocumentTypesRoutes(app);
    return app;
  }

  it("GET lists the active required types (tenant-scoped by operating_company_id)", async () => {
    const app = await buildApp("Owner");
    const res = await app.inject({ method: "GET", url: `/api/v1/compliance/required-document-types?operating_company_id=${OPCO}&entity_kind=driver` });
    expect(res.statusCode).toBe(200);
    expect(res.json().required_document_types[0].code).toBe("cdl");
    expect(lastScopedOpco).toBe(OPCO); // proves the RLS GUC was set to the requested company
  });

  it("POST as Owner creates a carrier-specific type (201)", async () => {
    const app = await buildApp("Owner");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/compliance/required-document-types",
      payload: { operating_company_id: OPCO, entity_kind: "driver", code: "custom_form", label: "Custom Form" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().required_document_type.is_seed).toBe(false);
  });

  it("POST as a non-Owner/Admin role is forbidden (matches the write RLS policy)", async () => {
    const app = await buildApp("Dispatcher");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/compliance/required-document-types",
      payload: { operating_company_id: OPCO, entity_kind: "driver", code: "custom_form", label: "Custom Form" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("PATCH promotes enforcement warn→hard_block", async () => {
    const app = await buildApp("Administrator");
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/compliance/required-document-types/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      payload: { operating_company_id: OPCO, enforcement: "hard_block" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().required_document_type.enforcement).toBe("hard_block");
  });

  it("rejects an invalid entity_kind (validation_error)", async () => {
    const app = await buildApp("Owner");
    const res = await app.inject({ method: "GET", url: `/api/v1/compliance/required-document-types?operating_company_id=${OPCO}&entity_kind=bogus` });
    expect(res.statusCode).toBe(400);
  });
});
