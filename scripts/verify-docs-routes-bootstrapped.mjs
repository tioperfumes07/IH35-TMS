#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INDEX_FILE = path.join(ROOT, "apps/backend/src/index.ts");
const ROUTES_FILE = path.join(ROOT, "apps/backend/src/docs/docs.routes.ts");

function fail(message) {
  console.error(`verify:docs-routes-bootstrapped — FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(ROUTES_FILE)) {
  fail("apps/backend/src/docs/docs.routes.ts not found");
}

if (!fs.existsSync(INDEX_FILE)) {
  fail("apps/backend/src/index.ts not found");
}

const indexText = fs.readFileSync(INDEX_FILE, "utf8");
if (!indexText.includes('import { registerDocsFoundationRoutes } from "./docs/docs.routes.js";')) {
  fail("index.ts missing registerDocsFoundationRoutes import");
}
if (!indexText.includes("await registerDocsFoundationRoutes(app);")) {
  fail("index.ts missing registerDocsFoundationRoutes bootstrapping call");
}

console.log("verify:docs-routes-bootstrapped — OK");
