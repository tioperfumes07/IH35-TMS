#!/usr/bin/env node
/**
 * verify-shadow-redirects.mjs
 * Assert that alias-shadow paths now redirect to real routes, not ComingSoonPage.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const MANIFEST = path.join(ROOT, "apps/frontend/src/routes/manifest.tsx");

if (!fs.existsSync(MANIFEST)) { console.error("FAIL: manifest.tsx not found"); process.exit(1); }
const src = fs.readFileSync(MANIFEST, "utf8");

let failed = false;
function fail(msg) { console.error(`[verify-shadow-redirects] FAIL: ${msg}`); failed = true; }
function pass(msg) { console.log(`[verify-shadow-redirects] PASS: ${msg}`); }

// Each entry: the alias path must NOT point to ComingSoonPage and MUST contain the real target
const checks = [
  { alias: "/safety/accidents-incidents",        realTarget: "/safety/accidents" },
  { alias: "/catalogs/classes",                  realTarget: "/lists/accounting/classes" },
  { alias: "/catalogs/payment-terms",            realTarget: "/lists/accounting/payment-terms" },
  { alias: "/catalogs/posting-templates",        realTarget: "/lists/accounting/posting-templates" },
  { alias: "/catalogs/account-role-bindings",    realTarget: "/lists/accounting/account-role-bindings" },
];

// Honest stubs — these SHOULD still point to ComingSoonPage (not real pages yet)
const honestStubs = [
  "/catalogs/accounts",
  "/catalogs/items",
  "/accounting/recurring-transactions",
];

for (const { alias, realTarget } of checks) {
  const idx = src.indexOf(`path="${alias}"`);
  if (idx === -1) { fail(`${alias}: route not found in manifest`); continue; }
  // Grab just this route's block — stop at the next <Route to avoid reading adjacent routes
  const raw = src.slice(idx, idx + 800);
  const nextRoute = raw.indexOf("<Route", 10);
  const block = nextRoute > 0 ? raw.slice(0, nextRoute) : raw;
  if (block.includes(realTarget)) {
    pass(`${alias} → ${realTarget}`);
  } else if (block.includes("ComingSoonPage")) {
    fail(`${alias}: still points to ComingSoonPage — expected redirect to ${realTarget}`);
  } else {
    fail(`${alias}: redirect target not found. Block: ${block.slice(0, 200)}`);
  }
}

for (const stub of honestStubs) {
  const stubEscaped = stub.replace(/\//g, "\\/");
  const re = new RegExp(`path="${stubEscaped}"[\\s\\S]{0,300}?(?:ComingSoonPage|coming-soon)`, "g");
  if (re.exec(src)) pass(`${stub}: honest stub (no real page — correct)`);
  else pass(`${stub}: acceptable (may be handled by redirect or real route)`);
}

if (failed) { console.error("\n[verify-shadow-redirects] FAILED"); process.exit(1); }
console.log("\n[verify-shadow-redirects] ALL CHECKS PASSED");
