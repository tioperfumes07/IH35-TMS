#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FRONTEND_DIR = path.join(ROOT, "apps", "frontend", "src");
const PREFIX = "IH35_VENDOR_PROFILE_V1::";
const ALLOWED_PREFIX_FILES = new Set([
  path.join("apps", "frontend", "src", "lib", "vendorProfileMeta.ts"),
]);

function listFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(full));
    else if (entry.isFile() && (full.endsWith(".ts") || full.endsWith(".tsx"))) files.push(full);
  }
  return files;
}

export function verifyNoInternalPayloadInNotes() {
  if (!fs.existsSync(FRONTEND_DIR)) throw new Error("frontend source directory not found");

  const violations = [];
  for (const file of listFiles(FRONTEND_DIR)) {
    const relative = path.relative(ROOT, file);
    const text = fs.readFileSync(file, "utf8");
    if (text.includes(PREFIX) && !ALLOWED_PREFIX_FILES.has(relative)) {
      violations.push(`${relative} contains internal vendor payload prefix`);
    }
    if (relative.endsWith("/pages/Vendors.tsx") && (text.includes("selectedVendor.notes ??") || text.includes("{selectedVendor.notes}"))) {
      violations.push(`${relative} renders selectedVendor.notes directly`);
    }
  }
  if (violations.length > 0) {
    throw new Error(`internal notes payload exposure detected:\n${violations.join("\n")}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  try {
    verifyNoInternalPayloadInNotes();
    console.log("verify:no-internal-payload-in-notes — OK");
  } catch (error) {
    console.error(`verify:no-internal-payload-in-notes — FAILED\n${String((error && error.message) || error)}`);
    process.exit(1);
  }
}
