#!/usr/bin/env node
import fs from "fs";
import path from "path";

const ROOT = new URL("..", import.meta.url).pathname;
const pass = (msg) => console.log(`[verify-e1] PASS: ${msg}`);
const fail = (msg) => { console.error(`[verify-e1] FAIL: ${msg}`); process.exit(1); };

function read(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf8");
}
function check(rel, pattern, label) {
  const src = read(rel);
  if (!src) fail(`file missing: ${rel}`);
  if (!(pattern instanceof RegExp ? pattern.test(src) : src.includes(pattern)))
    fail(`${label} — not found in ${rel}`);
  pass(label);
}

// ── 1. Service-token middleware ───────────────────────────────────────────────
const MW = "apps/backend/src/auth/service-token.middleware.ts";
const mwSrc = read(MW);
if (!mwSrc) fail(`service-token middleware missing: ${MW}`);
pass("service-token middleware file exists");

if (!mwSrc.includes("SERVICE_TOKEN_SECRET")) fail("SERVICE_TOKEN_SECRET env var not referenced in middleware");
pass("SERVICE_TOKEN_SECRET env var referenced");

if (!mwSrc.includes("Authorization") && !mwSrc.includes("authorization")) fail("Authorization header check missing");
pass("Authorization header checked");

if (!mwSrc.includes("401")) fail("401 response on invalid token missing");
pass("401 on invalid token");

if (!mwSrc.includes("requireServiceToken")) fail("requireServiceToken export missing");
pass("requireServiceToken exported");

// ── 2. Smoke probe route ─────────────────────────────────────────────────────
const PROBE = "apps/backend/src/admin/smoke-probe.routes.ts";
const probeSrc = read(PROBE);
if (!probeSrc) fail(`smoke probe routes missing: ${PROBE}`);
pass("smoke probe file exists");

if (!probeSrc.includes("requireServiceToken")) fail("smoke probe not gated by requireServiceToken");
pass("smoke probe gated by service token");

if (!probeSrc.includes("/api/v1/internal/smoke-probe")) fail("smoke probe endpoint path missing");
pass("smoke probe endpoint: /api/v1/internal/smoke-probe");

// Verify read-only: no INSERT/UPDATE/DELETE in probe
if (/\bINSERT\b|\bUPDATE\b|\bDELETE\b/i.test(probeSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, ""))) {
  fail("smoke probe contains mutation SQL — must be read-only");
}
pass("smoke probe is read-only (no mutation SQL)");

["db_ping", "event_log_read", "loads_read", "invoices_read", "spine_write_gate"].forEach(check => {
  if (!probeSrc.includes(check)) fail(`smoke probe missing check: ${check}`);
  pass(`smoke probe check present: ${check}`);
});

if (!probeSrc.includes("503")) fail("smoke probe missing 503 on failure");
pass("smoke probe returns 503 on failure");

// ── 3. index.ts registration ─────────────────────────────────────────────────
check("apps/backend/src/index.ts", "registerSmokeProbeRoutes", "smoke probe registered in index.ts");

// ── 4. perf-metrics accepts service token ────────────────────────────────────
check("apps/backend/src/middleware/response-time.ts", "requireServiceToken", "perf-metrics accepts service token");

// ── 5. No cron/internal endpoint bypasses auth entirely ──────────────────────
const internalRoutes = [
  "apps/backend/src/admin/migration-status.routes.ts",
  "apps/backend/src/middleware/response-time.ts",
  "apps/backend/src/admin/smoke-probe.routes.ts",
];
for (const rel of internalRoutes) {
  const src = read(rel);
  if (!src) fail(`internal route file missing: ${rel}`);
  const hasAuth = src.includes("requireAuth") || src.includes("requireServiceToken") || src.includes("currentAuthUser");
  if (!hasAuth) fail(`${rel} has no auth guard on internal endpoint`);
  pass(`${rel} has auth guard`);
}

// ── 6. SERVICE_TOKEN_SECRET documented in env ────────────────────────────────
const envExample = read(".env.example") ?? read(".env.sample") ?? "";
if (envExample && !envExample.includes("SERVICE_TOKEN_SECRET")) {
  // Not a hard fail — env example may not exist yet; just warn
  console.warn("[verify-e1] WARN: SERVICE_TOKEN_SECRET not in .env.example — consider documenting it");
} else {
  pass("SERVICE_TOKEN_SECRET documented in env example (or no env example to check)");
}

console.log("\n[verify-e1] ALL CHECKS PASSED");
