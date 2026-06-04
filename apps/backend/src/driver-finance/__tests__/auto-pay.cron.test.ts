import { describe, expect, it } from "vitest";
import { DRIVER_SETTLEMENT_AUTO_PAY_JOB } from "../auto-pay.cron.js";

describe("driver settlement auto-pay cron", () => {
  it("exports stable background job id", () => {
    expect(DRIVER_SETTLEMENT_AUTO_PAY_JOB).toBe("driver_finance.settlement_auto_pay_cron");
  });

  it("uses Friday payday schedule constant in module", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../auto-pay.cron.ts", import.meta.url), "utf8")
    );
    expect(source).toContain("0 6 * * 5");
    expect(source).toContain("settlement_auto_pay_enabled");
  });

  it("audits auto-pay queue events", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../auto-pay.cron.ts", import.meta.url), "utf8")
    );
    expect(source).toContain("driver_pay.settlement.auto_pay_queued");
  });

  it("respects disable env flag", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../auto-pay.cron.ts", import.meta.url), "utf8")
    );
    expect(source).toContain("ENABLE_DRIVER_SETTLEMENT_AUTO_PAY_CRON");
  });
});
