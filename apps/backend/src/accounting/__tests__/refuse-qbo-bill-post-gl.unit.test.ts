/**
 * Native bill GL eligibility is independent of QBO mirror metadata.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../");
const enginePath = path.join(ROOT, "apps/backend/src/accounting/posting-engine.service.ts");

describe("native bill post-gl eligibility (static contract)", () => {
  const src = fs.readFileSync(enginePath, "utf8");
  const start = src.indexOf("async function buildBillLines(");
  const end = src.indexOf("\nasync function ", start + 1);
  const builder = src.slice(start, end < 0 ? undefined : end);

  it("does not refuse native bill GL because of QBO-origin metadata", () => {
    expect(builder).not.toContain("QBO_BILL_POST_GL_REFUSED");
    expect(builder).not.toMatch(/\bbill\.source_system\b/);
  });

  it("keeps draft, void/revocation eligibility checks", () => {
    expect(builder).toContain("bill.revoked_at");
    expect(builder).toContain('bill.status === "draft"');
    expect(builder).toContain("BILL_NOT_POSTING_ELIGIBLE");
  });

  it("keeps the invoice revrec latch and executor period/balance/idempotency controls", () => {
    expect(src).toContain("revrecLatchOwnsLoad");
    expect(src).toContain("ensureOpenPeriod(client");
    expect(src).toContain("assertBalanced(draft.lines)");
    expect(src).toContain("getExistingPostingResultByIdempotencyKey");
  });
});
