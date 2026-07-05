import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const routesSrc = readFileSync(resolve(HERE, "../samsara-webhook.routes.ts"), "utf8");
const verifySrc = readFileSync(resolve(HERE, "../samsara-webhook-verify.ts"), "utf8");

// H4-2 static guard: these invariants must not silently regress.
describe("H4-2 guard: Samsara webhook signature + freshness + reject-before-persist + rate limit", () => {
  it("verifies the signature BEFORE any webhook-event payload INSERT (reject-before-persist)", () => {
    const verifyIdx = routesSrc.indexOf("verifySamsaraWebhookSignature(");
    const insertIdx = routesSrc.indexOf("INSERT INTO integrations.samsara_webhook_events");
    expect(verifyIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    // The signature check must appear before the first payload-persisting INSERT in source order.
    expect(verifyIdx).toBeLessThan(insertIdx);
  });

  it("returns 401 on a failed verification without persisting the payload", () => {
    const rejectIdx = routesSrc.indexOf("if (!verify.ok)");
    const insertIdx = routesSrc.indexOf("INSERT INTO integrations.samsara_webhook_events");
    expect(rejectIdx).toBeGreaterThan(-1);
    // The reject branch (which ends in a 401 return) precedes the persist path.
    expect(rejectIdx).toBeLessThan(insertIdx);
    expect(routesSrc).toMatch(/reply\.code\(401\)\.send\(\{\s*error:\s*"unauthorized"\s*\}\)/);
    // The reject branch must NOT INSERT the payload — only a bounded audit event is allowed.
    const rejectBranch = routesSrc.slice(rejectIdx, insertIdx);
    expect(rejectBranch).not.toContain("INSERT INTO integrations.samsara_webhook_events");
  });

  it("applies a per-IP rate limit to every webhook mount", () => {
    expect(routesSrc).toMatch(/SAMSARA_WEBHOOK_RATE_LIMIT\s*=\s*\{\s*max:\s*\d+,\s*timeWindow:/);
    expect(routesSrc).toMatch(/config:\s*\{\s*rateLimit:\s*SAMSARA_WEBHOOK_RATE_LIMIT\s*\}/);
  });

  it("implements Samsara's documented v1 scheme: HMAC-SHA256 over `v1:<timestamp>:<body>`", () => {
    expect(verifySrc).toContain("createHmac(\"sha256\"");
    expect(verifySrc).toContain("v1:${tsHeader}:");
    expect(verifySrc).toMatch(/x-samsara-signature/);
    expect(verifySrc).toMatch(/x-samsara-timestamp/);
  });

  it("enforces a timestamp-freshness / replay window and a constant-time compare", () => {
    expect(verifySrc).toMatch(/SAMSARA_WEBHOOK_MAX_SKEW_SECONDS\s*=\s*\d+/);
    expect(verifySrc).toContain("stale_timestamp");
    expect(verifySrc).toContain("timingSafeEqual");
  });
});
