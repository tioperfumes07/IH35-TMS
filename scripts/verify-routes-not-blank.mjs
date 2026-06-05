#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const ROUTE_CHECKS = [
  {
    route: "/425c",
    manifestNeedle: 'path="/425c"',
    pageFile: "apps/frontend/src/pages/form425c/Form425CHome.tsx",
    contentNeedles: ["Form425CHome", "listForm425CReports"],
  },
  {
    route: "/help",
    manifestNeedle: 'path="/help"',
    pageFile: "apps/frontend/src/pages/help/HelpCenterPage.tsx",
    contentNeedles: ["HelpCenterPage", "getAllHelpArticles"],
  },
];

const failures = [];
const manifestPath = path.join(repoRoot, "apps/frontend/src/routes/manifest.tsx");
const manifest = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, "utf8") : "";

for (const check of ROUTE_CHECKS) {
  if (!manifest.includes(check.manifestNeedle)) {
    failures.push(`${check.route} route missing from manifest.tsx`);
    continue;
  }
  const pagePath = path.join(repoRoot, check.pageFile);
  if (!fs.existsSync(pagePath)) {
    failures.push(`${check.pageFile} missing for ${check.route}`);
    continue;
  }
  const pageSource = fs.readFileSync(pagePath, "utf8");
  for (const needle of check.contentNeedles) {
    if (!pageSource.includes(needle)) {
      failures.push(`${check.pageFile} missing "${needle}" (${check.route} would render blank)`);
    }
  }
  if (pageSource.includes('return null') || pageSource.match(/return\s*<\s*>\s*<\/>/)) {
    failures.push(`${check.pageFile} appears to return empty shell for ${check.route}`);
  }
}

if (failures.length > 0) {
  console.error("[verify-routes-not-blank] FAIL:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log(`[verify-routes-not-blank] OK (${ROUTE_CHECKS.length} routes)`);
