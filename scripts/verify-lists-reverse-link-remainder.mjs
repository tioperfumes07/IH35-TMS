#!/usr/bin/env node
/**
 * Lists reverse_link remainder — Built for EntityLink catalog surfaces.
 * Create/modal/drawer + code-catalog .list chrome honesty-dropped in required.json.
 *
 * @matrix-built {"modules":["lists"],"cols":["reverse_link"],"leafRe":"^(catalog\\.drivers\\.teams\\.list|catalog\\.names_master\\.brokers\\.list)$","task":"VERTICAL-REVERSE-LINK-lists-remainder","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-lists-reverse-link-remainder.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lists-reverse-link-remainder";

const CHECKS = [
  {
    name: "DriverTeamsPage",
    file: "apps/frontend/src/pages/lists/driver/DriverTeamsPage.tsx",
    pattern: /kind="driver"/,
  },
  {
    name: "BrokersListPage",
    file: "apps/frontend/src/pages/lists/names/BrokersListPage.tsx",
    pattern: /kind="customer"/,
  },
];

function run(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    if (!/EntityLink/.test(src) || !c.pattern.test(src)) fails.push(`${c.name}: no EntityLink`);
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const live = run();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".lists-reverse-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison\n");
    }
    const planted = run(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL (${planted.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) {
    console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  process.exit(0);
}

const fails = run();
if (fails.length) {
  console.error(`${LABEL} FAIL:\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — lists reverse_link remainder ratcheted`);
