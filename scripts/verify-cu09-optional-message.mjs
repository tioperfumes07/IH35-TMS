#!/usr/bin/env node
/** LST-F154 — FE must not toast/banner String((error as Error)?.message) — use userFacingApiError. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cu09-optional-message";
const SELFTEST = process.argv.includes("--selftest");
const SRC = path.join(ROOT, "apps/frontend/src");

const BAD = /\bString\(\(\s*(?:error|err)\s+as\s+Error\s*\)\??\.message/;
const BAD_BANNER = /message=\{\(\s*(?:error|err)\s+as\s+Error\s*\)\?\.message\}/;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name.startsWith(".")) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(tsx?)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function offenders(files) {
  const hits = [];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    // Allow PayRunClosePanel structured extract only if it uses userFacingApiError
    const rel = path.relative(ROOT, f);
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      if (BAD.test(line) || BAD_BANNER.test(line)) {
        hits.push(`${rel}:${i + 1}:${line.trim().slice(0, 120)}`);
      }
      if (/\$\{\(\s*(?:error|err)\s+as\s+Error\s*\)\?\.message/.test(line)) {
        hits.push(`${rel}:${i + 1}:${line.trim().slice(0, 120)}`);
      }
    });
  }
  return hits;
}

const files = walk(SRC);

if (SELFTEST) {
  const probe = path.join(SRC, "__cu09_optional_selftest_probe__.tsx");
  fs.writeFileSync(probe, 'pushToast(String((error as Error)?.message ?? "x"), "error");\n');
  try {
    const planted = offenders([probe]);
    if (!planted.length) {
      console.error(`${LABEL} SELFTEST FAILED: planted not caught`);
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(probe);
  }
  const live = offenders(files);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live still has offenders:\n` + live.slice(0, 20).join("\n"));
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const hits = offenders(files);
if (hits.length) {
  console.error(`${LABEL} FAILED (${hits.length}):`);
  for (const h of hits.slice(0, 40)) console.error(" ", h);
  process.exit(1);
}
console.log(`${LABEL} OK`);
