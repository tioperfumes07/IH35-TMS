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

  // ── FINHUB-1 flag-parity guard: the backend must gate on the SAME DB feature flag the frontend
  //    reads (via isEnabled), NOT process.env — so the two sides can never split-brain. ──
  it("gates on the DB feature flag via isEnabled (no process.env read for the flag)", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "finance-hub.routes.ts"), "utf8");
    // Must resolve the flag through the canonical DB resolver.
    expect(src).toMatch(/isEnabled\s*\(/);
    expect(src).toMatch(/FINANCE_HUB_UI_ENABLED/);
    // Must NOT read the flag from the environment (the old split-brain source).
    expect(
      /process\.env\.FINANCE_HUB_UI_ENABLED/.test(src),
      "finance-hub route must not read the flag from process.env — resolve it via isEnabled(DB flag)",
    ).toBe(false);
  });
});

// ── Behavioral: flag gates reachability; OFF → 404 (no service call); ON → 200 with KPIs. ──
// The gate now resolves the DB feature flag via isEnabled (same source the frontend reads), so we
// drive it with a mocked isEnabled instead of process.env — proving backend+frontend read one flag.
const { overviewMock, membershipMock, isEnabledMock } = vi.hoisted(() => ({
  overviewMock: vi.fn(),
  membershipMock: vi.fn(),
  isEnabledMock: vi.fn(),
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

// withCurrentUser just runs the callback with a stub client; isEnabled is mocked so the client is unused.
// Partial mock so the rest of auth/db.js (luciaPool, etc.) stays real for other importers.
vi.mock("../auth/db.js", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    withCurrentUser: (_userUuid: string, fn: (client: unknown) => unknown) => fn({}),
  };
});

vi.mock("../lib/feature-flags/service.js", () => ({
  isEnabled: (...args: unknown[]) => isEnabledMock(...args),
}));

const apps: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  for (const a of apps.splice(0)) await a.close();
  vi.clearAllMocks();
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
    isEnabledMock.mockResolvedValue(false);
    const app = await build();
    const res = await app.inject({ method: "GET", url: URL });
    expect(res.statusCode).toBe(404);
    expect(overviewMock).not.toHaveBeenCalled();
    // Resolves the canonical DB flag for THIS operating company (not process.env).
    expect(isEnabledMock).toHaveBeenCalledWith(
      expect.anything(),
      "FINANCE_HUB_UI_ENABLED",
      expect.objectContaining({ operating_company_id: "11111111-1111-4111-8111-111111111111" }),
    );
  });

  it("flag ON → 200 with read-only KPI payload", async () => {
    isEnabledMock.mockResolvedValue(true);
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
