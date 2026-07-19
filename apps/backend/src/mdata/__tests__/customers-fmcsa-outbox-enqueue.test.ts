import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROUTES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../customers.routes.ts");

describe("customers.routes FMCSA durable enqueue (no fire-and-forget)", () => {
  const src = fs.readFileSync(ROUTES, "utf8");

  it("does not use void verifyCustomerWithSafer (no unhandled promise drop)", () => {
    expect(src).not.toMatch(/void\s+verifyCustomerWithSafer\s*\(/);
  });

  it("enqueues FMCSA verify inside create/update transactions", () => {
    expect(src).toMatch(/enqueueFmcsaCustomerVerifyRequested/);
    expect(src).toMatch(/trigger:\s*"create"/);
    expect(src).toMatch(/trigger:\s*"update"/);
    expect(src).toMatch(/buildFmcsaLookupFingerprint/);
  });

  it("manual force verify maps retryable to 503 without fake completion", () => {
    expect(src).toMatch(/\/api\/v1\/mdata\/customers\/:id\/verify-fmcsa/);
    expect(src).toMatch(/fmcsa_verify_retryable/);
    expect(src).toMatch(/reply\.code\(503\)/);
    expect(src).toMatch(/retryable:\s*true/);
    expect(src).not.toMatch(/catch\s*\([^)]*\)\s*\{\s*return reply\.send\(\{\s*customer/);
  });
});
