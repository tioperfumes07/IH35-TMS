import { describe, expect, it } from "vitest";
import { unwrapIntuitEntity } from "../qbo-entity-write.js";

describe("qbo entity write helpers", () => {
  it("unwrapIntuitEntity prefers Vendor wrapper", () => {
    const inner = { Id: "15", SyncToken: "2" };
    expect(unwrapIntuitEntity({ Vendor: inner })).toEqual(inner);
  });
});
