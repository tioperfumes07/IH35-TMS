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

  it("authorized FMCSA/write routes declare Fastify config.rateLimit (CodeQL #1162)", () => {
    // Canonical pattern: named RL_* const with config.rateLimit, passed as route options.
    expect(src).toMatch(/const RL_FMCSA_VERIFY\s*=\s*\{[\s\S]*?rateLimit\s*:/);
    expect(src).toMatch(/const RL_WRITE\s*=\s*\{[\s\S]*?rateLimit\s*:/);
    expect(src).toMatch(
      /\.post\(\s*["'`]\/api\/v1\/mdata\/customers\/:id\/verify-fmcsa["'`]\s*,\s*RL_FMCSA_VERIFY\s*,/
    );
    expect(src).toMatch(
      /\.patch\(\s*["'`]\/api\/v1\/mdata\/customers\/:id["'`]\s*,\s*RL_WRITE\s*,/
    );
    expect(src).toMatch(
      /\.post\(\s*["'`]\/api\/v1\/mdata\/customers["'`]\s*,\s*RL_WRITE\s*,/
    );
  });
});
