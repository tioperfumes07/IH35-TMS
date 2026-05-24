#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ciPath = path.resolve(".github/workflows/ci.yml");

function fail(message) {
  console.error(`verify:branch-fresh-wired FAIL: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(ciPath)) {
  fail("ci workflow file not found");
}

const source = fs.readFileSync(ciPath, "utf8");

if (!/^\s*verify-branch-fresh:\s*$/m.test(source)) {
  fail("ci.yml must define verify-branch-fresh job");
}

if (!/npm run verify:branch-fresh/m.test(source)) {
  fail("ci.yml must run npm run verify:branch-fresh");
}

if (!/pull_request:/m.test(source)) {
  fail("ci.yml must include pull_request trigger for branch freshness gate");
}

console.log("verify:branch-fresh-wired OK");
