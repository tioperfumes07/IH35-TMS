import { describe, expect, it } from "vitest";
import { appendStatusList } from "../statusListParams";

describe("U12 appendStatusList — a multi-select status travels as a repeated param", () => {
  it("repeats the key per pick, sends nothing for none", () => {
    const q = new URLSearchParams({ operating_company_id: "co" });
    appendStatusList(q, "status", ["open", "applied"]);
    expect(q.getAll("status")).toEqual(["open", "applied"]);
    const empty = new URLSearchParams();
    appendStatusList(empty, "status", []);
    appendStatusList(empty, "status", undefined);
    expect(empty.has("status")).toBe(false);
  });
  it("still accepts one status (old callers)", () => {
    const q = new URLSearchParams();
    appendStatusList(q, "status", "active");
    expect(q.toString()).toBe("status=active");
  });
});
