#!/usr/bin/env node
/**
 * VEND-VERIFY-01 — module VERIFY-1..8 ratchet: manifest routes + sibling guards
 * (S01 roster, S03/S04 dedup+types, S02 fact dual canonical profile) +
 * VendorDetail factor schedule relocation.
 *
 *   node scripts/verify-vend-verify-01.mjs
 *   node scripts/verify-vend-verify-01.mjs --selftest
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-vend-verify-01";

const SIBLINGS = [
  "scripts/verify-vend-s01-roster-active-filter.mjs",
  "scripts/verify-vend-s03-s04-dedup-and-types.mjs",
  "scripts/verify-fact-dual-canonical-profile.mjs",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function collectProblems(overrides = {}) {
  const manifest = overrides.manifest ?? read("apps/frontend/src/routes/manifest.tsx");
  const vendor = overrides.vendor ?? read("apps/frontend/src/pages/VendorDetail.tsx");
  const spawnSiblings = overrides.spawnSiblings !== false;
  const problems = [];

  if (!/path="\/vendors"/.test(manifest) || !/<VendorsPage/.test(manifest)) {
    problems.push("manifest must mount /vendors → VendorsPage");
  }
  if (!/path="\/vendors\/:id"/.test(manifest) || !/<VendorDetailPage/.test(manifest)) {
    problems.push("manifest must mount /vendors/:id → VendorDetailPage");
  }
  if (!/vendor-factor-schedule-relocated/.test(vendor) && !/emptyFactoringProfileMeta/.test(vendor)) {
    problems.push("VendorDetail must have vendor-factor-schedule-relocated or emptyFactoringProfileMeta");
  }

  if (spawnSiblings) {
    for (const script of SIBLINGS) {
      const r = spawnSync(process.execPath, [path.join(ROOT, script)], {
        cwd: ROOT,
        encoding: "utf8",
      });
      if (r.status !== 0) {
        problems.push(`${script} failed:\n${(r.stdout || "") + (r.stderr || "")}`.trim());
      }
    }
  }
  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const good = collectProblems();
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL (tip unclean):\n${good.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }

  const broken = collectProblems({
    manifest: read("apps/frontend/src/routes/manifest.tsx").replace(/<VendorsPage/g, "<GoneVendorsPage"),
    vendor: read("apps/frontend/src/pages/VendorDetail.tsx"),
    spawnSiblings: false,
  });
  if (!broken.some((p) => /VendorsPage/.test(p))) {
    console.error(`${LABEL} --selftest FAIL: planted manifest break not caught`);
    process.exit(1);
  }

  for (const script of SIBLINGS) {
    const r = spawnSync(process.execPath, [path.join(ROOT, script), "--selftest"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (r.status !== 0) {
      console.error(`${LABEL} --selftest FAIL: ${script} sibling selftest failed`);
      process.exit(1);
    }
  }

  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

if (IS_MAIN) {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — Vendors VERIFY-1..8 surfaces locked (6 of 7; VEND-LINK-01 money OPEN)`);
}
