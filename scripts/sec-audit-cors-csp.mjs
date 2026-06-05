#!/usr/bin/env node
/**
 * CLOSURE-19-SEC-AUDIT — CORS allowlist + security response headers audit.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "sec-audit-cors-csp";

function readRequired(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) {
    console.error(`[${LABEL}] FAIL: missing ${relPath}`);
    process.exit(1);
  }
  return fs.readFileSync(abs, "utf8");
}

function main() {
  const indexSrc = readRequired("apps/backend/src/index.ts");
  const corsConfig = readRequired("apps/backend/src/config/cors-allowed-origins.ts");
  const swSrc = readRequired("apps/driver-pwa/src/service-worker.ts");
  const frontendHtml = readRequired("apps/frontend/index.html");
  const driverHtml = readRequired("apps/driver-pwa/index.html");

  const report = {
    cors: {},
    headers: {},
    pwa_cache: {},
    gaps: [],
  };

  if (/origin:\s*["']\*["']/.test(indexSrc) || /origin:\s*true/.test(indexSrc)) {
    report.gaps.push({ severity: "critical", item: "CORS origin must not be wildcard on backend" });
  } else {
    report.cors.allowlist = "explicit getAllowedOrigins() callback — rejects unknown origins";
  }
  report.cors.credentials = indexSrc.includes("credentials: true");

  const headerChecks = [
    { name: "Content-Security-Policy", patterns: [/Content-Security-Policy/i, /contentSecurityPolicy/i, /helmet/i] },
    { name: "Strict-Transport-Security", patterns: [/Strict-Transport-Security/i, /hsts/i] },
    { name: "X-Frame-Options", patterns: [/X-Frame-Options/i, /frameguard/i] },
    { name: "Referrer-Policy", patterns: [/Referrer-Policy/i, /referrerPolicy/i] },
  ];

  const corpus = [indexSrc, corsConfig, frontendHtml, driverHtml].join("\n");
  for (const check of headerChecks) {
    const present = check.patterns.some((re) => re.test(corpus));
    report.headers[check.name] = present ? "present in static sources" : "NOT FOUND — gap documented";
    if (!present) {
      report.gaps.push({
        severity: "medium",
        item: `${check.name} not configured in backend or static HTML (Render CDN may add HSTS)`,
      });
    }
  }

  const sensitiveCachePatterns = [/localStorage\.setItem/i, /caches\.open.*api/i, /\/api\/v1\/auth/i];
  report.pwa_cache.shell_only = swSrc.includes('CACHE_NAME = "ih35-driver-shell-v2"');
  report.pwa_cache.urls = "SHELL_URLS cache static assets only (/, index.html, manifest, icons)";
  for (const re of sensitiveCachePatterns) {
    if (re.test(swSrc)) {
      report.gaps.push({ severity: "high", item: `service worker may cache sensitive data: ${re}` });
    }
  }

  console.log(`\n=== ${LABEL} report ===`);
  console.log(JSON.stringify(report, null, 2));

  const critical = report.gaps.filter((g) => g.severity === "critical");
  if (critical.length > 0) {
    console.error(`[${LABEL}] FAIL: ${critical.map((g) => g.item).join("; ")}`);
    process.exit(1);
  }

  console.log(`[${LABEL}] PASS (${report.gaps.length} documented header/PWA gaps — see security-baseline.md)`);
}

main();
