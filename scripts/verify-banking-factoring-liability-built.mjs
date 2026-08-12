#!/usr/bin/env node
/**
 * BANK-FACTORING-LIABILITY-BUILT — Banking Faro entry tab already surfaces
 * reserves held (factoring virtual reserve) — tag scoreboard liability built.
 *
 * @matrix-built {"modules":["banking"],"cols":["liability"],"leafRe":"^factoring$","task":"WAVE-C-liability-banking-factoring","vertical":"column-wave"}
 *
 * Usage: node scripts/verify-banking-factoring-liability-built.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-banking-factoring-liability-built";

function loadMod(mod) {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, `docs/specs/scoreboard/modules/${mod}.required.json`), "utf8"),
  );
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const doc = loadMod("banking");
  const clone = structuredClone(doc);
  const leaf = clone.leaves.find((l) => l.id === "factoring");
  if (!leaf) fail("selftest: banking.factoring missing");
  leaf.required = (leaf.required || []).filter((c) => c !== "liability");
  if ((leaf.required || []).includes("liability")) fail("selftest poison setup failed");
  const still = !(leaf.required || []).includes("liability");
  if (!still) fail("selftest poison missed");
  console.log(`${LABEL} --selftest PASS (poison would trip KEEP)`);
  process.exit(0);
}

const failures = [];
const doc = loadMod("banking");
const leaf = (doc.leaves || []).find((l) => l.id === "factoring");
if (!leaf) failures.push("banking missing factoring leaf");
else if (!(leaf.required || []).includes("liability")) failures.push("banking.factoring must KEEP liability");

const home = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/banking/BankingHome.tsx"), "utf8");
if (!/factoringReserve/.test(home) || !/Reserves held/.test(home)) {
  failures.push("BankingHome factoring tab must show Reserves held from factoringReserve");
}

if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — banking.factoring liability tagged built (reserves held)`);
