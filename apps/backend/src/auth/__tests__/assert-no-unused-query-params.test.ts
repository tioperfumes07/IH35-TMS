import { describe, it, expect, afterEach } from "vitest";
import { assertNoUnusedQueryParams } from "../db.js";

describe("assertNoUnusedQueryParams (Block 07 runtime guard)", () => {
  const orig = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = orig;
  });

  it("passes when every bind 1..N is referenced", () => {
    expect(() =>
      assertNoUnusedQueryParams("SELECT id FROM mdata.loads WHERE id = $1 AND operating_company_id = $2", ["a", "b"])
    ).not.toThrow();
  });

  it("passes when a param is referenced more than once", () => {
    expect(() =>
      assertNoUnusedQueryParams("SELECT * FROM t WHERE a = $1 OR b = $1", ["x"])
    ).not.toThrow();
  });

  it("passes with no params", () => {
    expect(() => assertNoUnusedQueryParams("SELECT now()", [])).not.toThrow();
    expect(() => assertNoUnusedQueryParams("SELECT now()", undefined)).not.toThrow();
  });

  it("THROWS the geofence shape: $1 passed but only $2/$3 referenced", () => {
    expect(() =>
      assertNoUnusedQueryParams(
        "SELECT 1 FROM geo.geofences g WHERE g.operating_company_id = $2 AND g.label LIKE $3",
        ["loadId", "oci", "load-x-stop-%"]
      )
    ).toThrow(/bind \$1 is passed/);
  });

  it("THROWS a trailing unused param ($2 passed, only $1 referenced)", () => {
    expect(() =>
      assertNoUnusedQueryParams("SELECT id FROM t WHERE id = $1", ["a", "unused"])
    ).toThrow(/bind \$2 is passed/);
  });

  it("is a no-op in production (off the hot path)", () => {
    process.env.NODE_ENV = "production";
    expect(() => assertNoUnusedQueryParams("SELECT id FROM t WHERE id = $1", ["a", "unused"])).not.toThrow();
  });
});
