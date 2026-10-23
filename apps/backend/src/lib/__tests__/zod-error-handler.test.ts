import Fastify from "fastify";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { installZodValidationErrorHandler, isZodError } from "../zod-error-handler.js";
import { bindCompanyIfPlaceholder } from "../../catalogs/catalog-registry.routes.js";

describe("LEAD 443.271 zod validation → 400", () => {
  const build = () => {
    const app = Fastify();
    installZodValidationErrorHandler(app);
    app.get("/needs-date", async (req) => {
      const q = z.object({ from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.query);
      return { ok: q.from_date };
    });
    app.get("/boom", async () => {
      throw new Error("real server failure");
    });
    app.get("/teapot", async () => {
      const e = new Error("i am a teapot") as Error & { statusCode: number };
      e.statusCode = 418;
      throw e;
    });
    return app;
  };

  it("missing required query field answers 400 with the field list (was 500)", async () => {
    const res = await build().inject({ method: "GET", url: "/needs-date" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("validation_error");
    expect(res.json().fields[0].path).toBe("from_date");
  });

  it("valid input still succeeds", async () => {
    const res = await build().inject({ method: "GET", url: "/needs-date?from_date=2026-10-19" });
    expect(res.statusCode).toBe(200);
  });

  it("a real server error is still a 500 (not hidden as 400)", async () => {
    const res = await build().inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(500);
  });

  it("an error carrying its own statusCode keeps it", async () => {
    const res = await build().inject({ method: "GET", url: "/teapot" });
    expect(res.statusCode).toBe(418);
  });

  it("isZodError recognises only zod errors", () => {
    expect(isZodError(new Error("x"))).toBe(false);
    const r = z.object({ a: z.string() }).safeParse({});
    expect(r.success).toBe(false);
    if (!r.success) expect(isZodError(r.error)).toBe(true);
  });
});

describe("LEAD 443.271 catalogs/registry binds $1 only when the SQL has it", () => {
  it("no placeholder → no bind values (Postgres rejects extras: the live 500)", () => {
    expect(bindCompanyIfPlaceholder("SELECT count(*) FROM catalogs.us_states", "c1")).toEqual([]);
  });
  it("$1 placeholder → company bound", () => {
    expect(bindCompanyIfPlaceholder("SELECT 1 WHERE operating_company_id = $1::uuid", "c1")).toEqual(["c1"]);
  });
  it("$10 alone does not count as $1", () => {
    expect(bindCompanyIfPlaceholder("SELECT $10", "c1")).toEqual([]);
  });
});
