#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const SAFETY_DIR = path.join(process.cwd(), "apps", "frontend", "src", "pages", "safety");
const FORBIDDEN_PATTERNS = [
  /legacy\s+driver/i,
  /test\s+driver/i,
  /\(demo\)/i,
  /driver_name\s*:\s*["'`].*demo.*["'`]/i,
];

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

export function verifyNoDemoRowsInSafety() {
  if (!fs.existsSync(SAFETY_DIR)) {
    throw new Error("safety pages directory not found");
  }
  const violations = [];
  for (const file of listFiles(SAFETY_DIR)) {
    const text = fs.readFileSync(file, "utf8");
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(text)) {
        violations.push(`${path.relative(process.cwd(), file)} matches ${pattern}`);
        break;
      }
    }
  }
  if (violations.length > 0) {
    throw new Error(`demo safety rows detected:\n${violations.join("\n")}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  try {
    verifyNoDemoRowsInSafety();
    console.log("verify:no-demo-rows-in-safety — OK");
  } catch (error) {
    console.error(`verify:no-demo-rows-in-safety — FAILED\n${String((error && error.message) || error)}`);
    process.exit(1);
  }
}
