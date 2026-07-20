#!/usr/bin/env node
/**
 * Punchlist 230 / §7: TypeCatalogAdmin must use "+ Create type" — never "Add Type" / "Add type".
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LABEL = "verify:insurance-type-catalog-create-vocab";

const target = path.join(ROOT, "apps/frontend/src/pages/insurance/TypeCatalogAdmin.tsx");

const FORBIDDEN = ["Add Type", "Add type"];

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

/** @param {string} src */
export function collectFailures(src) {
  const failures = [];

  if (!src.includes("+ Create type")) {
    failures.push("TypeCatalogAdmin must include + Create type label");
  }
  for (const phrase of FORBIDDEN) {
    if (src.includes(phrase)) {
      failures.push(`TypeCatalogAdmin must not contain forbidden label "${phrase}"`);
    }
  }

  return failures;
}

function selftest() {
  const good = collectFailures(read(target));
  if (good.length) {
    console.error(`${LABEL} SELFTEST FAIL — live source should pass before selftest`);
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const planted = collectFailures(read(target).replace("+ Create type", "Add type"));
  if (!planted.some((f) => f.includes("Add type"))) {
    console.error(`${LABEL} SELFTEST FAIL — did not detect planted violation`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

function main() {
  const failures = collectFailures(read(target));

  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log(`${LABEL} OK — TypeCatalogAdmin uses + Create type vocabulary`);
}

const isMain =
  path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else main();
}
