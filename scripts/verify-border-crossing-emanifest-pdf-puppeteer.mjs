#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(
  path.join(ROOT, "apps/backend/src/border-crossing/emanifest-pdf-renderer.service.ts"),
  "utf8"
);
const routes = fs.readFileSync(
  path.join(ROOT, "apps/backend/src/border-crossing/border-crossing-wizard.routes.ts"),
  "utf8"
);

if (!src.includes("puppeteer") || !src.includes("page.pdf")) {
  console.error("verify:border-crossing-emanifest-pdf-puppeteer FAIL: puppeteer page.pdf pattern missing");
  process.exit(1);
}
if (!routes.includes("emanifest.pdf")) {
  console.error("verify:border-crossing-emanifest-pdf-puppeteer FAIL: emanifest.pdf route missing");
  process.exit(1);
}

console.log("verify:border-crossing-emanifest-pdf-puppeteer PASS");
