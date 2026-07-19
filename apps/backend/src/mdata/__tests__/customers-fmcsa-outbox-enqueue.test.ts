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

  it("keeps manual force verify endpoint (direct, not only outbox)", () => {
    expect(src).toMatch(/\/api\/v1\/mdata\/customers\/:id\/verify-fmcsa/);
    expect(src).toMatch(/verifyCustomerWithSafer\(\{\s*[\s\S]*force:\s*true/);
  });
});
