import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import {
  assertNoDuplicateFastifyRouteKeys,
  assertNoDuplicateFastifyRoutes,
  parsePrintRoutesRouteKeys,
} from "./fastify-route-duplicates.js";

describe("fastify-route-duplicates", () => {
  it("does not false-positive on sibling /:id branches (distinct full paths)", async () => {
    const app = Fastify({ logger: false });
    await app.register(
      async (r) => {
        r.get("/:id", async () => ({}));
        r.patch("/:id", async () => ({}));
      },
      { prefix: "/api/v1/widgets" }
    );
    await app.register(
      async (r) => {
        r.get("/:id", async () => ({}));
        r.patch("/:id", async () => ({}));
      },
      { prefix: "/api/v1/gadgets" }
    );
    await app.ready();
    assertNoDuplicateFastifyRoutes(app);

    const keys = parsePrintRoutesRouteKeys(app.printRoutes({ commonPrefix: false }));
    const count = (method: string, base: string) => keys.filter((k) => k === `${method} ${base}/:id`).length;

    expect(count("GET", "/api/v1/widgets")).toBe(1);
    expect(count("PATCH", "/api/v1/widgets")).toBe(1);
    expect(count("GET", "/api/v1/gadgets")).toBe(1);
    expect(count("PATCH", "/api/v1/gadgets")).toBe(1);

    await app.close();
  });

  it("throws when the expanded route table contains duplicate METHOD + fullPath keys", () => {
    const tree = ["├── /dup (GET, HEAD)", "├── /other (GET, HEAD)", "├── /dup (GET, HEAD)"].join("\n");
    const keys = parsePrintRoutesRouteKeys(tree);
    expect(() => assertNoDuplicateFastifyRouteKeys(keys)).toThrow(/duplicate route detected: GET \/dup/);
  });
});
