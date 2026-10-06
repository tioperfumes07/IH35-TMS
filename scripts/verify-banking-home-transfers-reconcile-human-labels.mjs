#!/usr/bin/env node
/** LST-F120 — BankingHome + TransfersList + ReconciliationWorkspace: no UUID-slice chrome. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UUID_SLICE_RE, uuidSliceCaseFailures } from "./lib/uuid-slice.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "apps/frontend/src/pages/banking/BankingHome.tsx",
  "apps/frontend/src/pages/banking/TransfersListPage.tsx",
  "apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx",
];
const LABEL = "verify-banking-home-transfers-reconcile-human-labels";
const SELFTEST = process.argv.includes("--selftest");


function assertAll(srcs) {
  const problems = [];
  for (const [file, src] of Object.entries(srcs)) {
    if (UUID_SLICE_RE.test(src)) {
      problems.push(`${file}: still UUID-slices`);
    }
    if (!/entityLabel\(/.test(src)) {
      problems.push(`${file}: missing entityLabel`);
    }
  }
  return problems;
}

const read = () => Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const planted = { ...srcs };
  // Plant the defect by APPENDING it, never by replacing text that may no longer exist: the old replace() targeted an
  // entityLabel("Factoring advance") call that left BankingHome, planted nothing, and passed only because the
  // over-broad pattern matched an innocent date slice — a self-test that proved nothing.
  planted[FILES[0]] = `${planted[FILES[0]]}\nconst plantedLabel = row.display_id || row.id.slice(0, 8);\n`;
  if (!assertAll(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
    process.exit(1);
  }
  const wrong = uuidSliceCaseFailures();
  if (wrong.length) {
    console.error(`${LABEL} SELFTEST FAILED: UUID_SLICE_RE misjudges ${wrong.join(" | ")}`);
    process.exit(1);
  }
  const live = assertAll(srcs);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
