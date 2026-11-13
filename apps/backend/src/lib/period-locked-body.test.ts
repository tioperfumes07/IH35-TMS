import { describe, expect, it } from "vitest";
import { periodLockedBody } from "./zod-error-handler.js";

describe("ENG-38 closed-period refusal → 423 body", () => {
  it("parses the engine's IH35_CLOSED_PERIOD message into the close date and the transaction date", () => {
    const body = periodLockedBody(new Error("IH35_CLOSED_PERIOD closed_through=2026-08-31 txn_date=2026-08-15"));
    expect(body).toMatchObject({ error: "period_locked", closed_through: "2026-08-31", txn_date: "2026-08-15" });
    expect(body?.message).toContain("closed through 2026-08-31");
  });
  it("leaves every other error alone", () => {
    expect(periodLockedBody(new Error("duplicate key value"))).toBeNull();
    expect(periodLockedBody(null)).toBeNull();
  });
});
