#!/usr/bin/env node
/**
 * Kill the LST-PICKER lists.json PARTIAL thrash.
 *
 * If this PR touches LST-PICKER consumer/registry/guard files AND edits lists.json while
 * LST-PICKER-01 status remains FAIL, FAIL — append to lists-picker-partials.md instead.
 * Cursor even claim: 1828.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker-no-lists-json-partial-thrash";
const LISTS = "docs/module-completion/lists.json";
const PARTIALS = "docs/module-completion/lists-picker-partials.md";

function gitDiffNames() {
  try {
    const out = execSync("git diff --name-only origin/main...HEAD", {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** @returns {string[]} */
export function collectProblems(root = ROOT, changedFiles = null, listsJson = null) {
  const problems = [];
  const partialsPath = path.join(root, PARTIALS);
  if (!fs.existsSync(partialsPath)) {
    problems.push(`missing ${PARTIALS} (append-only LST-PICKER partial log)`);
  }
  const gitattributes = fs.readFileSync(path.join(root, ".gitattributes"), "utf8");
  if (!/CLAIMED-NUMBERS\.json\s+merge=json-union/.test(gitattributes)) {
    problems.push(".gitattributes must map CLAIMED-NUMBERS.json to merge=json-union");
  }
  if (!/catalogPickerRegistry\.ts\s+merge=catalog-picker-union/.test(gitattributes)) {
    problems.push(".gitattributes must map catalogPickerRegistry.ts to merge=catalog-picker-union");
  }
  if (!/lists-picker-partials\.md\s+merge=union/.test(gitattributes)) {
    problems.push(".gitattributes must map lists-picker-partials.md to merge=union");
  }

  const changed = changedFiles ?? gitDiffNames();
  if (!changed.length) return problems;

  const touchesPicker =
    changed.some((f) => /catalogPickerRegistry\.ts$/.test(f)) ||
    changed.some((f) => /verify-lst-picker01-/.test(f)) ||
    changed.some((f) => /ReferenceSelect|CargoClaimIntake|InternalFines|EscrowForfeit|HosViolationCreate/.test(f));
  const touchesListsJson = changed.includes(LISTS);
  if (!touchesPicker || !touchesListsJson) return problems;

  const lists = listsJson ?? JSON.parse(fs.readFileSync(path.join(root, LISTS), "utf8"));
  const item = (lists.items || []).find((i) => i.id === "LST-PICKER-01");
  if (!item) {
    problems.push("LST-PICKER-01 missing from lists.json");
    return problems;
  }
  if (item.status === "FAIL") {
    problems.push(
      `${LISTS}: LST-PICKER slice PRs must NOT edit lists.json while status=FAIL — append a line to ${PARTIALS} instead (conflict treadmill)`
    );
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems(ROOT, []);
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }
  const actualLists = JSON.parse(fs.readFileSync(path.join(ROOT, LISTS), "utf8"));
  const failLists = {
    ...actualLists,
    items: (actualLists.items || []).map((i) =>
      i.id === "LST-PICKER-01" ? { ...i, status: "FAIL" } : i
    ),
  };
  const planted = collectProblems(ROOT, [
    LISTS,
    "apps/frontend/src/components/parity/catalogPickerRegistry.ts",
  ], failLists);
  if (!planted.some((p) => p.includes("must NOT edit lists.json"))) {
    console.error(`${LABEL} SELFTEST FAIL: planted lists.json+registry change not flagged`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK`);
}
 else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK`);
}
