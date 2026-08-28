import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Static read-only invariant: mirrors qbo-recon.readonly.test.ts — Ledger Health is display-only.
//    No PATCH/POST/DELETE method and no write SQL against _system.reconciliation_findings anywhere in
//    these two files. See ledger-health-reads.ts's "SELF-CLOSE ONLY / NO HUMAN RESOLVE" header. ──
describe("LEDGER-HEALTH — static read-only invariant", () => {
  const files = ["ledger-health.routes.ts", "ledger-health-reads.ts"].map((f) => path.resolve(__dirname, f));

  it("issues no write SQL (no INSERT/UPDATE/DELETE/UPSERT/TRUNCATE)", () => {
    const writeKeyword = /\b(insert\s+into|update\s+\w|delete\s+from|truncate|merge\s+into|on\s+conflict)\b/i;
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      expect(writeKeyword.test(src), `${path.basename(file)} must not contain write SQL`).toBe(false);
    }
  });

  it("registers no non-GET HTTP method", () => {
    const src = fs.readFileSync(files[0], "utf8");
    expect(/\bapp\.(post|patch|put|delete)\s*\(/i.test(src), "ledger-health.routes.ts must be GET-only").toBe(false);
    expect(src.includes("app.get(")).toBe(true);
  });
});

// ── Behavioral: route is unconditionally mounted (no feature flag) and issues only SELECTs. ──
const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("../accounting/shared.js", async (orig) => {
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
});

async function build() {
  const mod = await import("./ledger-health.routes.js");
  const app = Fastify();
  apps.push(app);
  queryMock.mockImplementation(async () => ({ rows: [] }));
  await app.register(mod.default);
  return app;
}

const URL = "/api/v1/system/ledger-health?operating_company_id=11111111-1111-4111-8111-111111111111";

describe("LEDGER-HEALTH — mounted unconditionally, read-only at runtime", () => {
  it("200s with an empty-but-shaped response and every SQL statement issued is read-only", async () => {
    const app = await build();
    const res = await app.inject({ method: "GET", url: URL });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.operating_company_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(body.findings).toEqual([]);
    expect(body.open_findings_count).toBe(0);
    expect(body.by_integration).toEqual([]);
    expect(queryMock).toHaveBeenCalled();
    const writeKeyword = /\b(insert\s+into|update\s+\w|delete\s+from|truncate|merge\s+into)\b/i;
    for (const call of queryMock.mock.calls) {
      const sql = String(call[0]);
      expect(writeKeyword.test(sql), `unexpected write SQL: ${sql.slice(0, 80)}`).toBe(false);
    }
  });

  it("rejects a missing operating_company_id with a validation error, not a 500", async () => {
    const app = await build();
    const res = await app.inject({ method: "GET", url: "/api/v1/system/ledger-health" });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });
});
