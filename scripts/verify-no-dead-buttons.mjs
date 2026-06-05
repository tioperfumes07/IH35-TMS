#!/usr/bin/env node
/**
 * FINAL-AUDIT-PASS CI guard: button onClick handlers must be real actions or // intentional-noop.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FRONTEND = path.join(ROOT, "apps/frontend/src");

function fail(msg) {
  console.error(`verify:no-dead-buttons FAIL: ${msg}`);
  process.exit(1);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__") continue;
      walk(abs, out);
    } else if (entry.name.endsWith(".tsx")) {
      out.push(abs);
    }
  }
  return out;
}

function isDeadHandler(body) {
  const trimmed = body.trim();
  if (!trimmed) return true;
  if (/^undefined\b/.test(trimmed)) return true;
  if (/^null\b/.test(trimmed)) return true;
  if (/^\(\)\s*=>\s*\{\s*\}\s*$/.test(trimmed)) return true;
  if (/^\(\)\s*=>\s*undefined\s*$/.test(trimmed)) return true;
  if (/^function\s*\(\)\s*\{\s*\}\s*$/.test(trimmed)) return true;
  return false;
}

function scanFile(filePath) {
  const rel = path.relative(ROOT, filePath);
  const src = fs.readFileSync(filePath, "utf8");
  const lines = src.split("\n");
  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("onClick")) continue;
    if (line.includes("intentional-noop")) continue;

    const inline = line.match(/onClick=\{([^}]+)\}/);
    if (inline) {
      const handler = inline[1].trim();
      if (handler === "{}" || handler === "undefined" || handler === "null") {
        violations.push(`${rel}:${i + 1} dead inline onClick`);
      }
      continue;
    }

    if (/onClick=\{\(\)\s*=>\s*\{\s*\}\}/.test(line)) {
      violations.push(`${rel}:${i + 1} empty arrow onClick`);
    }
    if (/onClick=\{undefined\}/.test(line)) {
      violations.push(`${rel}:${i + 1} undefined onClick`);
    }
  }

  const blockMatches = [...src.matchAll(/onClick=\{\s*([\s\S]*?)\s*\}/g)];
  for (const match of blockMatches) {
    if (match[0].includes("intentional-noop")) continue;
    const body = match[1];
    if (isDeadHandler(body)) {
      const idx = src.indexOf(match[0]);
      const line = src.slice(0, idx).split("\n").length;
      violations.push(`${rel}:${line} dead multiline onClick`);
    }
  }

  return violations;
}

function main() {
  const files = walk(FRONTEND);
  const all = files.flatMap(scanFile);
  if (all.length > 0) {
    for (const v of all.slice(0, 20)) console.error(v);
    if (all.length > 20) console.error(`... and ${all.length - 20} more`);
    fail(`${all.length} dead button handler(s)`);
  }
  console.log(`verify:no-dead-buttons PASS (${files.length} tsx files scanned)`);
}

main();
