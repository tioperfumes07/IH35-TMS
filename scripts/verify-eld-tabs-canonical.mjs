#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const eldPagePath = path.join(ROOT, "apps/frontend/src/pages/eld/EldPage.tsx");

function fail(message) {
  console.error(`verify:eld-tabs-canonical failed: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(eldPagePath)) {
  fail("missing EldPage.tsx");
}

const source = fs.readFileSync(eldPagePath, "utf8");

if (!source.includes('import { SecondaryNavTabs } from "../../components/shared/SecondaryNavTabs";')) {
  fail("EldPage.tsx is not importing SecondaryNavTabs");
}

if (!source.includes("<SecondaryNavTabs")) {
  fail("EldPage.tsx is not rendering SecondaryNavTabs");
}

if (source.includes('rounded border px-3 py-1.5 text-sm transition-colors')) {
  fail("EldPage.tsx still contains legacy button-style tab classes");
}

if (source.includes("border-blue-600 bg-blue-600 text-white")) {
  fail("EldPage.tsx still contains active blue button-style tabs");
}

console.log("verify:eld-tabs-canonical: ok");
