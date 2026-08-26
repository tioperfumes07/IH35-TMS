#!/usr/bin/env node
/**
 * verify-saf-action-mutation-error-wave7
 * SAF-ACTION-MUTATION-SILENT-FAIL-WAVE7 — SafetyLayout prefsMutation must surface isError.
 * Void paths use VoidReasonModal (rejects keep form open) — not silent.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-saf-action-mutation-error-wave7";
const FILE = "apps/frontend/src/pages/safety/SafetyLayout.tsx";
const NEEDLES = [
  "userFacingApiError",
  "prefsMutation.isError",
  "safety-prefs-error",
  'scope: { id: "safety-filter-preferences" }',
];

function assertFile(rel, needles) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  return needles.filter((n) => !src.includes(n)).map((n) => `${rel}: missing ${n}`);
}

function assertCompleteSafetyWrites(source) {
  const writes = [...source.matchAll(/prefsMutation\.mutateAsync\(\{([\s\S]*?)\}\);/g)].map((match) => match[1]);
  if (writes.length !== 2) return [`expected 2 Safety preference writes, found ${writes.length}`];
  return writes.flatMap((write, index) =>
    ["active_only", "activity_window"]
      .filter((field) => !write.includes(field))
      .map((field) => `write ${index + 1} missing ${field}`)
  );
}

function selftest() {
  const badFixtures = [
    `void prefsMutation.mutateAsync({})`,
    ["userFacingApiError", "prefsMutation.isError", "safety-prefs-error"].join("\n"),
    [...NEEDLES.slice(0, 3), 'scope: { id: "other-preferences" }'].join("\n"),
  ];
  const tmp = path.join(process.cwd(), ".tmp-saf-wave7-selftest.tsx");
  for (const [index, bad] of badFixtures.entries()) {
    fs.writeFileSync(tmp, bad);
    try {
      if (assertFile(".tmp-saf-wave7-selftest.tsx", NEEDLES).length === 0) {
        console.error(`${LABEL} SELFTEST FAIL bad fixture ${index + 1}`);
        process.exit(1);
      }
    } finally {
      fs.unlinkSync(tmp);
    }
  }
  const incomplete = `prefsMutation.mutateAsync({ safety: { active_only: true } });\nprefsMutation.mutateAsync({ safety: { activity_window: "7d" } });`;
  if (assertCompleteSafetyWrites(incomplete).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL incomplete writes`);
    process.exit(1);
  }
  fs.writeFileSync(tmp, NEEDLES.join("\n"));
  try {
    if (assertFile(".tmp-saf-wave7-selftest.tsx", NEEDLES).length > 0) {
      console.error(`${LABEL} SELFTEST FAIL good`);
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(tmp);
  }
  console.log(`${LABEL} selftest PASS — 3 planted silent/racy preference regressions rejected`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

if (!fs.existsSync(path.join(process.cwd(), FILE))) {
  console.error(`${LABEL} FAIL: missing ${FILE}`);
  process.exit(1);
}
const errors = assertFile(FILE, NEEDLES);
errors.push(...assertCompleteSafetyWrites(fs.readFileSync(path.join(process.cwd(), FILE), "utf8")));
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — SafetyLayout serializes full Safety preference writes and surfaces isError`);
