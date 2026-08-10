#!/usr/bin/env node
import fs from "node:fs";

const page = fs.readFileSync("apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx", "utf8");
const checks = [
  ["failed query branches before table", /listQuery\.isError \? \([\s\S]*?<ListErrorBanner/.test(page)],
  ["server error is surfaced", /userFacingApiError\(listQuery\.error/.test(page)],
  ["failure is not described as empty", page.includes("No empty result was assumed")],
  ["retry refetches scoped query", /onRetry=\{\(\) => void listQuery\.refetch\(\)\}/.test(page)],
];
const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
if (failed.length) process.exit(1);
console.log(`verify-legal-matters-error-honesty: ${checks.length}/${checks.length} PASS`);
