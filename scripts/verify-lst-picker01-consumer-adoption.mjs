#!/usr/bin/env node
/**
 * LST-PICKER-01 close — every catalogPickerRegistry entry with consumerPath MUST wire
 * ReferenceSelect createKind={key} in each documented consumer file.
 *
 *   node scripts/verify-lst-picker01-consumer-adoption.mjs
 *   node scripts/verify-lst-picker01-consumer-adoption.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseRegistryEntries } from "./verify-catalog-picker-registry-parity.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-consumer-adoption";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** @param {{ registry?: string }} [overrides] */
export function collectProblems(overrides = {}) {
  const problems = [];
  const registrySrc = overrides.registry ?? read(REGISTRY);
  const code = stripComments(registrySrc);

  for (const { key, block } of parseRegistryEntries(code)) {
    const consumerMatch = block.match(/consumerPath:\s*(?:\[([\s\S]*?)\]|"([^"]+)")/);
    if (!consumerMatch) continue;

    const paths = consumerMatch[1]
      ? [...consumerMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
      : [consumerMatch[2]];

    const kindPattern = new RegExp(`createKind=["']${key}["']`);

    for (const rel of paths) {
      const abs = path.join(ROOT, rel);
      if (!fs.existsSync(abs)) {
        problems.push(`${REGISTRY}[${key}]: consumerPath missing on disk: ${rel}`);
        continue;
      }
      const consumerCode = stripComments(read(rel));
      if (!/ReferenceSelect/.test(consumerCode)) {
        problems.push(`${rel}: must use ReferenceSelect for createKind=${key}`);
      }
      if (!kindPattern.test(consumerCode)) {
        problems.push(`${rel}: missing ReferenceSelect createKind="${key}" (LST-PICKER-01 consumer adoption)`);
      }
    }
  }

  const withConsumer = parseRegistryEntries(code).filter((e) => /consumerPath:/.test(e.block)).length;
  if (withConsumer < 20) {
    problems.push(`${REGISTRY}: expected >=20 consumerPath entries, found ${withConsumer}`);
  }

  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const broken = `${read(REGISTRY).slice(0, 800)}\n  fake_key: catalogEntry({ key: "fake_key", label: "x", table: "catalogs.x", endpoint: "/x", evidence: "apps/x.ts:1", consumerPath: "apps/frontend/src/pages/Home.tsx" }),\n`;
  if (collectProblems({ registry: broken }).length === 0) {
    console.error(`${LABEL} --selftest FAIL: broken fixture not flagged`);
    process.exit(1);
  }
  const real = collectProblems();
  if (real.length) {
    console.error(`${LABEL} --selftest FAIL on real tree:`, real);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

if (IS_MAIN) {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — all consumerPath registry entries wire createKind in their consumers`);
}
