import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("plaid daily refresh cron alias", () => {
  it("delegates to plaid-daily-sync initializer", () => {
    const src = fs.readFileSync(
      path.resolve("apps/backend/src/integrations/plaid/daily-refresh.cron.ts"),
      "utf8"
    );
    expect(src).toContain("initializePlaidDailySyncCron");
  });

  it("exports shared job id", () => {
    const src = fs.readFileSync(
      path.resolve("apps/backend/src/integrations/plaid/daily-refresh.cron.ts"),
      "utf8"
    );
    expect(src).toContain("PLAID_DAILY_SYNC_JOB");
  });
});
