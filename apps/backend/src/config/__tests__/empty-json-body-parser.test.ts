import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { installEmptyJsonBodyParser } from "../empty-json-body-parser.js";

/**
 * Regression for the prod Sentry error on POST /banking/categorization-rules/:id/apply-historical:
 * "Body cannot be empty when content-type is set to 'application/json'" (FST_ERR_CTP_EMPTY_JSON_BODY).
 * The action carries all inputs in the query string; the Electron client sends application/json with an
 * empty body. The parser must map empty -> {} while parsing real bodies unchanged.
 */
async function buildApp() {
  const app = Fastify({ logger: false });
  installEmptyJsonBodyParser(app);
  app.post("/echo", async (req) => ({ body: req.body }));
  await app.ready();
  return app;
}

describe("installEmptyJsonBodyParser", () => {
  it("accepts an EMPTY application/json body (maps to {}) instead of 400", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/echo",
      headers: { "content-type": "application/json" },
      payload: "",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ body: {} });
    await app.close();
  });

  it("accepts a whitespace-only application/json body as {}", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/echo", headers: { "content-type": "application/json" }, payload: "   " });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ body: {} });
    await app.close();
  });

  it("still parses a non-empty JSON body exactly as before", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/echo",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ a: 1, nested: { b: true } }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ body: { a: 1, nested: { b: true } } });
    await app.close();
  });

  it("still rejects MALFORMED JSON with 400 (does not silently swallow)", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/echo", headers: { "content-type": "application/json" }, payload: "{not json" });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
