import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Static read-only invariant: the route + service contain no write SQL and import no
//    posting/QBO-writer modules. AF-6 is a display-only Finance Hub landing dashboard. ──
describe("AF-6 finance-hub — static read-only invariant", () => {
  const files = ["finance-hub.routes.ts", "finance-hub.service.ts"].map((f) => path.resolve(__dirname, f));

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

  it("registers only a GET handler (no POST/PUT/PATCH/DELETE)", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "finance-hub.routes.ts"), "utf8");
    expect(/app\.(post|put|patch|delete)\s*\(/i.test(src), "finance-hub route must be GET-only").toBe(false);
    expect(/app\.get\s*\(/.test(src)).toBe(true);
  });
});

// ── Behavioral: flag gates reachability; OFF → 404 (no service call); ON → 200 with KPIs. ──
const { overviewMock, membershipMock } = vi.hoisted(() => ({
  overviewMock: vi.fn(),
  membershipMock: vi.fn(),
}));

vi.mock("./shared.js", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    currentAuthUser: () => ({ uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "Owner" }),
  };
});

vi.mock("../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: (...args: unknown[]) => membershipMock(...args),
}));

vi.mock("./finance-hub.service.js", () => ({
  getFinanceHubOverview: (...args: unknown[]) => overviewMock(...args),
}));

const apps: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  for (const a of apps.splice(0)) await a.close();
  vi.clearAllMocks();
  delete process.env.FINANCE_HUB_UI_ENABLED;
});

async function build() {
  const mod = await import("./finance-hub.routes.js");
  const app = Fastify();
  apps.push(app);
  membershipMock.mockResolvedValue(undefined);
  overviewMock.mockResolvedValue({
    operating_company_id: "11111111-1111-4111-8111-111111111111",
    generated_at: "2026-06-29T00:00:00.000Z",
    read_only: true,
    kpis: [{ key: "cash_position", label: "Cash position", value_kind: "money_cents", value: 0, secondary: null, drill_to: "/cash-flow", drill_label: "View cash flow" }],
  });
  await app.register(mod.default);
  return app;
}

const URL = "/api/v1/finance/hub/overview?operating_company_id=11111111-1111-4111-8111-111111111111";

describe("AF-6 finance-hub — flag gating", () => {
  it("flag OFF (default) → 404 unreachable, service never called", async () => {
    const app = await build();
    const res = await app.inject({ method: "GET", url: URL });
    expect(res.statusCode).toBe(404);
    expect(overviewMock).not.toHaveBeenCalled();
  });

  it("flag ON → 200 with read-only KPI payload", async () => {
    process.env.FINANCE_HUB_UI_ENABLED = "true";
    const app = await build();
    const res = await app.inject({ method: "GET", url: URL });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.read_only).toBe(true);
    expect(body.operating_company_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(Array.isArray(body.kpis)).toBe(true);
    expect(overviewMock).toHaveBeenCalledTimes(1);
  });
});
