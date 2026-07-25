import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("ACCT-CoA-ASYMMETRY — static read-only invariant", () => {
  const files = ["coa-asymmetry-report.routes.ts", "coa-asymmetry-report.service.ts"].map((f) =>
    path.resolve(__dirname, f),
  );

  it("issues no write SQL (no INSERT/UPDATE/DELETE/UPSERT/TRUNCATE on catalogs.accounts)", () => {
    const writeKeyword =
      /\b(insert\s+into\s+catalogs\.accounts|update\s+catalogs\.accounts|delete\s+from\s+catalogs\.accounts|truncate\s+catalogs\.accounts)\b/i;
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      expect(writeKeyword.test(src), `${path.basename(file)} must not mutate catalogs.accounts`).toBe(false);
    }
  });

  it("does not toggle is_postable or mutate reserve/holdback/retainage rows", () => {
    const reserveMutation =
      /\b(update|insert\s+into|delete\s+from)\b[\s\S]{0,120}\b(reserve|holdback|retainage)\b/i;
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      expect(/\bis_postable\s*=/.test(src), `${path.basename(file)} must not assign is_postable`).toBe(false);
      expect(reserveMutation.test(src), `${path.basename(file)} must not mutate reserve/holdback/retainage`).toBe(false);
    }
  });

  it("registers only a GET handler (no POST/PUT/PATCH/DELETE)", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "coa-asymmetry-report.routes.ts"), "utf8");
    expect(/app\.(post|put|patch|delete)\s*\(/i.test(src), "coa-asymmetry route must be GET-only").toBe(false);
    expect(/app\.get\s*\(/.test(src)).toBe(true);
  });

  it("returns read_only: true in the report type", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "coa-asymmetry-report.service.ts"), "utf8");
    expect(src).toMatch(/read_only:\s*true/);
  });
});

const reportMock = vi.fn();

vi.mock("./shared.js", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    currentAuthUser: () => ({ uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "Owner" }),
  };
});

vi.mock("./coa-asymmetry-report.service.js", () => ({
  getCoaAsymmetryReport: (...args: unknown[]) => reportMock(...args),
}));

describe("ACCT-CoA-ASYMMETRY — route behavior", () => {
  afterEach(() => {
    reportMock.mockReset();
  });

  it("Owner → 200 with read_only report", async () => {
    reportMock.mockResolvedValueOnce({
      read_only: true,
      postable_by_entity: [{ entity_code: "TRK", postable: 947, total_active: 948 }],
    });
    const { registerCoaAsymmetryReportRoutes } = await import("./coa-asymmetry-report.routes.js");
    const app = Fastify();
    await registerCoaAsymmetryReportRoutes(app);
    const res = await app.inject({ method: "GET", url: "/api/v1/accounting/coa-asymmetry-report" });
    expect(res.statusCode).toBe(200);
    expect(res.json().read_only).toBe(true);
    await app.close();
  });
});
