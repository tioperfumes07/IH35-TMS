// LEAD 443.208R — the pure parts of the one load-change signal.
import { describe, expect, it } from "vitest";
import { directConnectionString, parseLoadChangedPayload } from "../load-change-bus.js";
import { foldLoadChanges } from "../../notifications/stream.routes.js";

describe("load-change bus (443.208R)", () => {
  it("LISTENs on the direct endpoint, never the -pooler one", () => {
    expect(directConnectionString({ DATABASE_URL: "postgresql://u:p@ep-x-123-pooler.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require" }))
      .toBe("postgresql://u:p@ep-x-123.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require");
    expect(directConnectionString({ DATABASE_URL: "postgresql://u:p@ep-x-pooler.neon.tech/db", DATABASE_DIRECT_URL: "postgresql://u:p@direct/db" }))
      .toBe("postgresql://u:p@direct/db");
    expect(directConnectionString({ DATABASE_URL: "postgresql://localhost/db" })).toBe("postgresql://localhost/db");
  });
  it("parses only real payloads", () => {
    expect(parseLoadChangedPayload('{"company_id":"c1","load_ids":["l1"],"table":"mdata.loads","op":"UPDATE"}'))
      .toEqual({ company_id: "c1", load_ids: ["l1"], table: "mdata.loads", op: "UPDATE" });
    expect(parseLoadChangedPayload('{"company_id":"c1","load_ids":[]}')).toBeNull();
    expect(parseLoadChangedPayload("not json")).toBeNull();
  });
  it("folds a 250ms window per company and drops companies the user may not see", () => {
    const out = foldLoadChanges([
      { company_id: "usmca", load_ids: ["a"], table: "mdata.loads", op: "UPDATE" },
      { company_id: "usmca", load_ids: ["a", "b"], table: "mdata.load_stops", op: "INSERT" },
      { company_id: "other", load_ids: ["z"], table: "mdata.loads", op: "UPDATE" },
    ], new Set(["usmca"]));
    expect(out).toEqual([{ company_id: "usmca", load_ids: ["a", "b"], tables: ["mdata.loads", "mdata.load_stops"] }]);
  });
});
