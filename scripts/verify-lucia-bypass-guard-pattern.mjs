#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "apps/backend/src");
const LABEL = "verify:lucia-bypass-guard-pattern";

const ADMIN_ONLY_HINTS = [
  "requireOwnerOrAdmin(",
  "requireOwner(",
  "requireAdmin(",
  "ownerOrAdmin",
  "Owner\", \"Administrator",
  "/api/v1/admin/",
  "adminOnly",
];

const BOOTSTRAP_HINTS = [
  "/auth/",
  "/health/",
  "/webhook/",
  "/cron/",
  ".cron.",
  "scheduler",
  "/oauth",
  "/public/",
  "/shipper-portal/",
  "sync-health",
];

const GUARD_HINTS = [
  "assertCompanyMembership(",
  "requireOperatingCompanyScope(",
  "withCompany(",
  "withCompanyScope(",
];

function collectFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(full));
    } else if (entry.isFile() && full.endsWith(".ts") && !full.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

function locateFunctionStart(lines, idx) {
  for (let i = idx; i >= 0; i -= 1) {
    const line = lines[i];
    if (
      /^\s*(async\s+)?function\s+\w+/.test(line) ||
      /^\s*(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s*)?\(?.*=>\s*\{?\s*$/.test(line) ||
      /^\s*app\.(get|post|put|patch|delete)\(/.test(line)
    ) {
      return i;
    }
  }
  return -1;
}

function lineHasGuard(line) {
  return GUARD_HINTS.some((hint) => line.includes(hint));
}

function hasAdminOnlyMiddleware(line) {
  return ADMIN_ONLY_HINTS.some((hint) => line.includes(hint));
}

function isBootstrapPath(filePath) {
  const rel = path.relative(ROOT, filePath).replaceAll("\\", "/");
  return BOOTSTRAP_HINTS.some((hint) => rel.includes(hint));
}

function isRouteFile(filePath) {
  return filePath.endsWith(".routes.ts");
}

function isAdminPath(filePath) {
  const rel = path.relative(ROOT, filePath).replaceAll("\\", "/");
  return rel.includes("/admin/") || rel.endsWith("admin.routes.ts") || rel.includes("forensic-admin");
}

function routePathFromLine(line) {
  const m = line.match(/app\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/);
  return m?.[2] ?? null;
}

function locateRouteStart(lines, idx) {
  for (let i = idx; i >= 0; i -= 1) {
    if (/^\s*app\.(get|post|put|patch|delete)\(/.test(lines[i])) {
      return i;
    }
  }
  return -1;
}

const offenders = [];
const files = collectFiles(SRC_DIR);

for (const filePath of files) {
  const content = fs.readFileSync(filePath, "utf8");
  if (!content.includes("withLuciaBypass(")) continue;

  const lines = content.split(/\r?\n/);
  const rel = path.relative(ROOT, filePath).replaceAll("\\", "/");
  const bootstrapFile = isBootstrapPath(filePath);
  const routeFile = isRouteFile(filePath);
  const adminPath = isAdminPath(filePath);
  const fileHasAdminOnly = lines.some((line) => hasAdminOnlyMiddleware(line));
  const tenantScopedFile = content.includes("operating_company_id");

  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].includes("withLuciaBypass(")) continue;

    // Non-route and non-tenant-scoped files are treated as infrastructure/worker paths.
    if (!routeFile || !tenantScopedFile) continue;

    const routeStart = locateRouteStart(lines, i);
    if (routeStart < 0) continue;

    const routePath = routePathFromLine(lines[routeStart]) ?? "";
    const routeBootstrap = BOOTSTRAP_HINTS.some((hint) => routePath.includes(hint));
    const routeAdmin = ADMIN_ONLY_HINTS.some((hint) => routePath.includes(hint));

    if (bootstrapFile || adminPath || fileHasAdminOnly || routeBootstrap || routeAdmin) continue;

    const fnStart = locateFunctionStart(lines, i);
    const start = fnStart >= 0 ? fnStart : 0;
    const before = lines.slice(start, i + 1);
    const hasMembership = before.some((line) => lineHasGuard(line));
    if (hasMembership) continue;

    offenders.push(`${rel}:${i + 1}`);
  }
}

if (offenders.length > 0) {
  console.error(`${LABEL} FAIL`);
  console.error("NORMAL-AUTH withLuciaBypass sites missing guard:");
  for (const o of offenders) console.error(`- ${o}`);
  process.exit(1);
}

console.log(`${LABEL} PASS (${files.length} files scanned)`);
