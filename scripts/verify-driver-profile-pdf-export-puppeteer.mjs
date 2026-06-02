#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const renderer = path.join(ROOT, "apps/backend/src/mdata/driver-profile-pdf-renderer.service.ts");
const routes = path.join(ROOT, "apps/backend/src/mdata/driver-pdf-export.routes.ts");
const src = fs.readFileSync(renderer, "utf8") + fs.readFileSync(routes, "utf8");
if (!src.includes("puppeteer") || !src.includes("page.pdf")) {
  console.error("verify:driver-profile-pdf-export-puppeteer FAIL: puppeteer page.pdf pattern missing");
  process.exit(1);
}
console.log("verify:driver-profile-pdf-export-puppeteer PASS");
