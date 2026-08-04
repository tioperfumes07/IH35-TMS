#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const LABEL = "verify-inv-verify-01";
const SELFTEST = process.argv.includes("--selftest");
const SIBLINGS = [
  "scripts/verify-inv-s01-parts-roster-density.mjs",
  "scripts/verify-inv-cat-01-category-honesty.mjs",
  "scripts/verify-inv-s02-s03-pick-01.mjs",
];

function run(script) {
  const r = spawnSync(process.execPath, [join(ROOT, script)], { encoding: "utf8" });
  return { script, code: r.status ?? 1, out: ((r.stdout || "") + (r.stderr || "")).slice(0, 240) };
}

export function verify() {
  const errs = [];
  const manifest = readFileSync(join(ROOT, "apps/frontend/src/routes/manifest.tsx"), "utf8");
  for (const p of ["/inventory", "/inventory/assignments", "/inventory/purchases"]) {
    if (!manifest.includes(`path="${p}"`)) errs.push(`manifest missing ${p}`);
  }
  for (const s of SIBLINGS) {
    if (!existsSync(join(ROOT, s))) errs.push(`missing ${s}`);
    else {
      const r = run(s);
      if (r.code !== 0) errs.push(`${s} exit ${r.code}: ${r.out}`);
    }
  }
  return errs;
}

if (SELFTEST) {
  const e = verify();
  if (e.length) { console.error(LABEL, "FAIL", e); process.exit(1); }
  console.log(`${LABEL} --selftest OK`);
} else {
  const e = verify();
  if (e.length) { console.error(LABEL, "FAIL"); e.forEach((x) => console.error(" -", x)); process.exit(1); }
  console.log(`${LABEL} PASS`);
}
