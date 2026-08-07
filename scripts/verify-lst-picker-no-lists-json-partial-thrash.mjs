#!/usr/bin/env node
/**
 * Kill the LST-PICKER lists.json PARTIAL thrash.
 *
 * If this PR touches LST-PICKER consumer/registry/guard files AND edits lists.json while
 * LST-PICKER-01 status remains FAIL, FAIL — append to lists-picker-partials.md instead.
 * Cursor even claim: 1828.
 */
import fs from "node:fs";
import os from "node:os";
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
export function collectProblems(root = ROOT, changedFiles = null) {
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

  const lists = JSON.parse(fs.readFileSync(path.join(root, LISTS), "utf8"));
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

  // Selftest must NOT depend on live LST-PICKER-01 status (PASS after lists close #4281).
  // Plant a throwaway FAIL fixture so detection stays load-bearing forever.
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lst-picker-thrash-"));
  try {
    fs.mkdirSync(path.join(tmpRoot, "docs/module-completion"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, ".gitattributes"),
      [
        "scripts/verify-steps/CLAIMED-NUMBERS.json merge=json-union",
        "apps/frontend/src/components/parity/catalogPickerRegistry.ts merge=catalog-picker-union",
        "docs/module-completion/lists-picker-partials.md merge=union",
        "",
      ].join("\n"),
      "utf8"
    );
    fs.writeFileSync(path.join(tmpRoot, PARTIALS), "# LST-PICKER partials (selftest)\n", "utf8");
    fs.writeFileSync(
      path.join(tmpRoot, LISTS),
      JSON.stringify(
        {
          module: "lists",
          complete: false,
          items: [{ id: "LST-PICKER-01", status: "FAIL", title: "selftest planted FAIL" }],
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const planted = collectProblems(tmpRoot, [
      LISTS,
      "apps/frontend/src/components/parity/catalogPickerRegistry.ts",
    ]);
    if (!planted.some((p) => p.includes("must NOT edit lists.json"))) {
      console.error(`${LABEL} SELFTEST FAIL: planted lists.json+registry change not flagged`);
      console.error("  planted problems:", planted);
      process.exit(1);
    }

    // PASS status must NOT fire the thrash rule (close PR editing both is legal).
    fs.writeFileSync(
      path.join(tmpRoot, LISTS),
      JSON.stringify(
        {
          module: "lists",
          complete: true,
          items: [{ id: "LST-PICKER-01", status: "PASS", title: "selftest planted PASS" }],
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
    const passOk = collectProblems(tmpRoot, [
      LISTS,
      "apps/frontend/src/components/parity/catalogPickerRegistry.ts",
    ]);
    if (passOk.some((p) => p.includes("must NOT edit lists.json"))) {
      console.error(`${LABEL} SELFTEST FAIL: PASS status incorrectly flagged thrash`);
      process.exit(1);
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  console.log(`${LABEL} SELFTEST OK`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK`);
}
