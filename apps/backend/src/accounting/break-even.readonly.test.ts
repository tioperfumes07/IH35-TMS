import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyExpense } from "./break-even.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Static read-only invariant: F1 Break-Even is display-only analytics. The route + service must
//    contain no write SQL and import no posting/QBO-writer modules. ──
describe("F1 break-even — static read-only invariant", () => {
  const files = ["break-even.routes.ts", "break-even.service.ts"].map((f) => path.resolve(__dirname, f));

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
    const src = fs.readFileSync(path.resolve(__dirname, "break-even.routes.ts"), "utf8");
    expect(/app\.(post|put|patch|delete)\s*\(/i.test(src), "break-even route must be GET-only").toBe(false);
    expect(/app\.get\s*\(/.test(src)).toBe(true);
  });
});

// ── Classification: the ATBS/McLeod fixed-vs-variable default split. ──
describe("F1 break-even — default expense classification", () => {
  it("marks mileage-driven costs as variable", () => {
    for (const name of ["Fuel - Diesel", "Tires", "Truck Maintenance & Repair", "Tolls", "DEF Fluid", "Oil & Lube"]) {
      expect(classifyExpense(name), name).toBe("variable");
    }
  });
  it("marks time/asset-driven costs as fixed", () => {
    for (const name of ["Truck Payment", "Insurance - Liability", "Permits & Licenses", "Depreciation", "Office Rent"]) {
      expect(classifyExpense(name), name).toBe("fixed");
    }
  });
});

// ── Behavioral: flag gates reachability; OFF → 404 (no service call); ON → 200 with read-only inputs. ──
const { inputsMock, membershipMock } = vi.hoisted(() => ({
  inputsMock: vi.fn(),
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

vi.mock("./break-even.service.js", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    getBreakEvenInputs: (...args: unknown[]) => inputsMock(...args),
  };
});

const apps: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  for (const a of apps.splice(0)) await a.close();
  vi.clearAllMocks();
  delete process.env.FINANCE_BREAK_EVEN_UI_ENABLED;
});

async function build() {
  const mod = await import("./break-even.routes.js");
  const app = Fastify();
  apps.push(app);
  membershipMock.mockResolvedValue(undefined);
  inputsMock.mockResolvedValue({
    operating_company_id: "11111111-1111-4111-8111-111111111111",
    from_date: "2026-01-01",
    to_date: "2026-06-30",
    days_in_period: 181,
    generated_at: "2026-06-30T00:00:00.000Z",
    read_only: true,
    disclaimer: "estimate",
    revenue: { gl_revenue_cents: 0, loads_gross_revenue_cents: 0 },
    miles: { total_miles: 0, loaded_miles: 0, deadhead_miles: 0, load_count: 0 },
    expense_lines: [],
    totals: { fixed_cost_cents: 0, variable_cost_cents: 0, total_cost_cents: 0 },
  });
  await app.register(mod.default);
  return app;
}

const URL = "/api/v1/finance/break-even?operating_company_id=11111111-1111-4111-8111-111111111111";

describe("F1 break-even — flag gating", () => {
  it("flag OFF (default) → 404 unreachable, service never called", async () => {
    const app = await build();
    const res = await app.inject({ method: "GET", url: URL });
    expect(res.statusCode).toBe(404);
    expect(inputsMock).not.toHaveBeenCalled();
  });

  it("flag ON → 200 with read-only inputs payload", async () => {
    process.env.FINANCE_BREAK_EVEN_UI_ENABLED = "true";
    const app = await build();
    const res = await app.inject({ method: "GET", url: URL });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.read_only).toBe(true);
    expect(body.operating_company_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(Array.isArray(body.expense_lines)).toBe(true);
    expect(inputsMock).toHaveBeenCalledTimes(1);
  });
});
