import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Static read-only invariant: the route + reads module contain no write SQL and import no
//    posting/QBO-writer modules. CASCADE-14 is a display-only reconciliation screen. ──
describe("CASCADE-14 qbo-recon — static read-only invariant", () => {
  const files = ["qbo-recon.routes.ts", "qbo-recon-reads.ts"].map((f) => path.resolve(__dirname, f));

  it("issues no write SQL (no INSERT/UPDATE/DELETE/UPSERT/TRUNCATE)", () => {
    const writeKeyword = /\b(insert\s+into|update\s+\w|delete\s+from|truncate|merge\s+into|on\s+conflict)\b/i;
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      expect(writeKeyword.test(src), `${path.basename(file)} must not contain write SQL`).toBe(false);
    }
  });

  it("imports no posting-engine / QBO-writer / journal-write modules", () => {
    const forbidden = [/posting-engine/i, /qbo-writer/i, /journal-entry-qbo-push/i, /qbo-push/i, /sync-queue-enqueue/i];
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        expect(pattern.test(src), `${path.basename(file)} must not import ${pattern}`).toBe(false);
      }
    }
  });
});

// ── Behavioral: flag gates reachability; when ON, only SELECTs are issued to the DB client. ──
const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("./shared.js", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    currentAuthUser: () => ({ uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "Owner" }),
    withCompanyScope: async (
      _u: string,
      _c: string,
      fn: (client: { query: typeof queryMock }) => Promise<unknown>
    ) => fn({ query: queryMock }),
  };
});

const apps: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  for (const a of apps.splice(0)) await a.close();
  vi.clearAllMocks();
  delete process.env.TMS_QBO_RECON_UI_ENABLED;
});

async function build() {
  const mod = await import("./qbo-recon.routes.js");
  const app = Fastify();
  apps.push(app);
  // Every read returns an empty/zero shape. The counts row is a single object of zeros.
  queryMock.mockImplementation(async () => ({ rows: [] }));
  await app.register(mod.default);
  return app;
}

const URL = "/api/v1/accounting/qbo-recon?operating_company_id=11111111-1111-4111-8111-111111111111";

describe("CASCADE-14 qbo-recon — flag gating + read-only at runtime", () => {
  it("flag OFF (default) → 404 unreachable, no DB queries", async () => {
    const app = await build();
    const res = await app.inject({ method: "GET", url: URL });
    expect(res.statusCode).toBe(404);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("flag ON → 200, and every SQL statement issued is read-only (SELECT/set_config only)", async () => {
    process.env.TMS_QBO_RECON_UI_ENABLED = "true";
    const app = await build();
    const res = await app.inject({ method: "GET", url: URL });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.operating_company_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(body.objects).toHaveLength(5);
    expect(body.objects.every((o: { tms_count: number }) => o.tms_count === 0)).toBe(true);
    expect(queryMock).toHaveBeenCalled();
    const writeKeyword = /\b(insert\s+into|update\s+\w|delete\s+from|truncate|merge\s+into)\b/i;
    for (const call of queryMock.mock.calls) {
      const sql = String(call[0]);
      expect(writeKeyword.test(sql), `unexpected write SQL: ${sql.slice(0, 80)}`).toBe(false);
    }
  });
});
