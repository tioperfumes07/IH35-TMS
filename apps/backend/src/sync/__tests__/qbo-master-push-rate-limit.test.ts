import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SYNC_DIR = path.resolve(TEST_DIR, "..");

describe("qbo master push shared rate limit module", () => {
  it("exports a single 100/min shared budget for customers, vendors, and accounts", () => {
    const sharedPath = path.join(SYNC_DIR, "qbo-master-push-rate-limit.ts");
    const customersPath = path.join(SYNC_DIR, "qbo-customers-push.ts");
    const vendorsPath = path.join(SYNC_DIR, "qbo-vendors-push.ts");
    const accountsPath = path.join(SYNC_DIR, "qbo-accounts-push.ts");

    expect(fs.existsSync(sharedPath)).toBe(true);
    const sharedText = fs.readFileSync(sharedPath, "utf8");
    expect(sharedText).toContain("QBO_MASTER_PUSH_RATE_LIMIT_PER_MIN = 100");
    expect(sharedText).toContain("canPushWithinMasterRateLimit");

    const customersText = fs.readFileSync(customersPath, "utf8");
    const vendorsText = fs.readFileSync(vendorsPath, "utf8");
    const accountsText = fs.readFileSync(accountsPath, "utf8");
    expect(customersText).toContain("qbo-master-push-rate-limit.js");
    expect(vendorsText).toContain("qbo-master-push-rate-limit.js");
    expect(accountsText).toContain("qbo-master-push-rate-limit.js");
    expect(customersText).toContain("recordQboMasterPushAttempt");
    expect(vendorsText).toContain("recordQboMasterPushAttempt");
    expect(accountsText).toContain("recordQboMasterPushAttempt");
  });
});
