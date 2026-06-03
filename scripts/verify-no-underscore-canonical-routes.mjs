#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, "apps/frontend/src/routes/manifest.tsx");
const pagesRoot = path.join(repoRoot, "apps/frontend/src/pages");

const LEGACY_REDIRECT_ALLOWLIST = new Set([
  "apps/frontend/src/pages/lists/ListsHubPage.tsx",
]);

function listPageFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      listPageFiles(abs, out);
      continue;
    }
    if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) {
      out.push(abs);
    }
  }
  return out;
}

function findUnderscoreRoutePaths(source, relPath) {
  if (LEGACY_REDIRECT_ALLOWLIST.has(relPath)) return [];

  const hits = [];
  const patterns = [
    /path="([^"]*_[^"]*)"/g,
    /path='([^']*_[^']*)'/g,
    /path:\s*"([^"]*_[^"]*)"/g,
    /path:\s*'([^']*_[^']*)'/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      const routePath = match[1];
      if (routePath.includes(":")) continue;
      hits.push(routePath);
    }
  }

  return hits;
}

const failures = [];

const manifestSource = fs.readFileSync(manifestPath, "utf8");
for (const routePath of findUnderscoreRoutePaths(manifestSource, "apps/frontend/src/routes/manifest.tsx")) {
  failures.push(`manifest.tsx registers underscore route path "${routePath}"`);
}

for (const abs of listPageFiles(pagesRoot)) {
  const rel = path.relative(repoRoot, abs).replace(/\\/g, "/");
  const source = fs.readFileSync(abs, "utf8");
  for (const routePath of findUnderscoreRoutePaths(source, rel)) {
    failures.push(`${rel} registers underscore route path "${routePath}"`);
  }
}

if (failures.length > 0) {
  console.error("verify:no-underscore-canonical-routes — FAILED");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("verify:no-underscore-canonical-routes — OK");
