#!/usr/bin/env node
/** Fill-not-shell batch 3 — BoardSection panels.  node scripts/verify-fill-batch3-boards.mjs [--selftest] */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fill-batch3-boards";
const SURFACES = [
  [
    "MultiEntityAccountingPage",
    "apps/frontend/src/pages/accounting/MultiEntityAccountingPage.tsx",
    [
      "multi-entity-query-board",
      "multi-entity-by-company-board",
      "multi-entity-accounts-board",
    ],
    ["multi-entity-by-company-table", "Run consolidated summary"],
  ],
  [
    "QboReconcileCapturesPage",
    "apps/frontend/src/pages/accounting/QboReconcileCapturesPage.tsx",
    [
      "qbo-recon-health-board",
      "qbo-recon-captures-board",
      "qbo-recon-runs-board",
    ],
    ["ParityTable"],
  ],
];
function audit(read) {
  const fails = [];
  for (const [id, rel, ids, keep] of SURFACES) {
    const src = read(rel);
    if (!src.includes("components/v3/BoardSection"))
      fails.push(`${id}: import`);
    for (const tid of ids)
      if (!src.includes(`testId="${tid}"`)) fails.push(`${id}: ${tid}`);
    for (const k of keep) if (!src.includes(k)) fails.push(`${id}: keep ${k}`);
  }
  return fails;
}

/** Planted-defect selftest: each mutation is applied to the REAL source of one surface and must be caught. */
function selftest(mutations) {
  const clean = audit(readReal);
  if (clean.length) {
    console.error(
      `${LABEL} SELFTEST FAILED — real sources must pass before planting:\n  - ${clean.join("\n  - ")}`,
    );
    process.exit(1);
  }
  const missed = [];
  for (const m of mutations) {
    const original = readReal(m.file);
    const mutated = m.mutate(original);
    if (mutated === original) {
      missed.push(
        `${m.name}: mutation did not change ${m.file} (stale fixture)`,
      );
      continue;
    }
    const got = audit((rel) => (rel === m.file ? mutated : readReal(rel)));
    if (!got.some((f) => f.includes(m.expect)))
      missed.push(
        `${m.name}: NOT caught (got: ${got.join(" | ") || "no failures"})`,
      );
  }
  if (missed.length) {
    console.error(
      `${LABEL} SELFTEST FAILED — ${mutations.length - missed.length}/${mutations.length} planted defects caught:\n  - ${missed.join("\n  - ")}`,
    );
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects caught`,
  );
  process.exit(0);
}

const readReal = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
if (process.argv.includes("--selftest")) {
  selftest([
    {
      name: "BoardSection import dropped",
      file: SURFACES[0][1],
      expect: "MultiEntityAccountingPage: import",
      mutate: (src) =>
        src.split("components/v3/BoardSection").join("components/v3/Gone"),
    },
    {
      name: "board testId removed",
      file: SURFACES[1][1],
      expect: "qbo-recon-runs-board",
      mutate: (src) =>
        src
          .split('testId="qbo-recon-runs-board"')
          .join('testId="qbo-recon-runs-gone"'),
    },
    {
      name: "ParityTable dropped",
      file: SURFACES[1][1],
      expect: "keep ParityTable",
      mutate: (src) => src.split("ParityTable").join("RawTable"),
    },
  ]);
}

const fails = audit(readReal);
if (fails.length) {
  console.error(LABEL + ": FAIL\n  - " + fails.join("\n  - "));
  process.exit(1);
}
console.log(`${LABEL}: PASS — ${SURFACES.length}`);
