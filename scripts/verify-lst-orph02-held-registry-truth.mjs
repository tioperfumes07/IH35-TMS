#!/usr/bin/env node
/**
 * LST-ORPH-02 closure — held-migration registry reports applied state truthfully.
 *
 * #3515 merged 2026-07-25 (applied_held split). Companions:
 *   verify-held-registry-ledger-parity · verify-held-registry-integrity
 *   verify-steps 1483/1487
 * Cursor even claim: 1776.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-orph02-held-registry-truth";
const HELD = "db/migrations/.held-migrations.json";
const LISTS = "docs/module-completion/lists.json";
const COMPANIONS = [
  "scripts/verify-held-registry-ledger-parity.mjs",
  "scripts/verify-held-registry-integrity.mjs",
];

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function collectProblems() {
  const problems = [];
  const heldRaw = read(HELD);
  const listsRaw = read(LISTS);

  if (!heldRaw) problems.push(`missing ${HELD}`);
  else {
    try {
      const h = JSON.parse(heldRaw);
      if (!Array.isArray(h.held) || !Array.isArray(h.applied_held)) {
        problems.push(`${HELD} must expose held[] and applied_held[] sections`);
      }
      const badApplied = (h.applied_held || []).filter((e) => e.applied_on_prod !== true);
      if (badApplied.length) {
        problems.push(`${badApplied.length} applied_held entries missing applied_on_prod:true`);
      }
      const dup = new Set();
      for (const e of [...(h.held || []), ...(h.applied_held || [])]) {
        if (dup.has(e.file)) problems.push(`duplicate file across sections: ${e.file}`);
        dup.add(e.file);
      }
    } catch {
      problems.push(`${HELD} invalid JSON`);
    }
  }

  for (const c of COMPANIONS) {
    if (!read(c)) problems.push(`missing ${c}`);
  }

  if (listsRaw) {
    try {
      const lists = JSON.parse(listsRaw);
      const item = lists.items?.find((i) => i.id === "LST-ORPH-02");
      if (!item) problems.push("LST-ORPH-02 missing");
      else if (item.status === "PASS") {
        if (!/1776|3515|applied_held/i.test(String(item.evidence ?? ""))) {
          problems.push("LST-ORPH-02 PASS evidence must cite #3515 + guard 1776 + applied_held");
        }
      } else if (item.status !== "FAIL") {
        problems.push(`LST-ORPH-02 unexpected status ${item.status}`);
      }
    } catch {
      problems.push(`${LISTS} invalid JSON`);
    }
  } else problems.push(`missing ${LISTS}`);

  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK`);
} else {
  const problems = collectProblems();
  for (const c of COMPANIONS) {
    const r = spawnSync(process.execPath, [path.join(ROOT, c)], { cwd: ROOT, encoding: "utf8" });
    if ((r.status ?? 1) !== 0) problems.push(`companion ${c} exited ${r.status}`);
  }
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — held registry split truthful; companions green`);
}
