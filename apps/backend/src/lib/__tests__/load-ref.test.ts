import { describe, expect, it } from "vitest";
import { LOAD_NUMBER_RE, loadRefParamSchema } from "../load-ref.js";

describe("loadRefParamSchema GO-19 plain digits", () => {
  it("accepts canonical digit load numbers", () => {
    expect(LOAD_NUMBER_RE.test("13561")).toBe(true);
    expect(loadRefParamSchema.safeParse({ id: "13561" }).success).toBe(true);
  });

  it("still accepts legacy L- numbers", () => {
    expect(loadRefParamSchema.safeParse({ id: "L-20260901-0001" }).success).toBe(true);
  });

  it("still accepts UUIDs", () => {
    expect(
      loadRefParamSchema.safeParse({ id: "5c854333-6ea5-4faa-af31-67cb272fef80" }).success
    ).toBe(true);
  });

  it("rejects junk", () => {
    expect(loadRefParamSchema.safeParse({ id: "not a load" }).success).toBe(false);
  });
});
