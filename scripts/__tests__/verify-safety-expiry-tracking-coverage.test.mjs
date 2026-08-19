import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-safety-expiry-tracking-coverage.mjs");
const sourceFiles = [
  "apps/backend/src/safety/driver-profile.routes.ts",
  "apps/backend/src/safety/driver-qualification.routes.ts",
  "apps/backend/src/safety/medical-cards.routes.ts",
  "apps/backend/src/safety/background-checks.routes.ts",
  "apps/backend/src/safety/training-records.routes.ts",
  "apps/frontend/src/api/safety.ts",
  "apps/frontend/src/components/safety/BackgroundChecksSection.tsx",
  "apps/frontend/src/components/safety/MedicalCardsHistorySection.tsx",
  "apps/frontend/src/pages/safety/tabs/DOTComplianceTab.tsx",
  "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
];

function withFixture(mutate, run) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "safety-expiry-test-"));
  try {
    for (const rel of sourceFiles) {
      const target = path.join(fixtureRoot, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(root, rel), target);
    }
    mutate?.(fixtureRoot);
    return run(fixtureRoot);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function runFixture(mutate) {
  return withFixture(mutate, (fixtureRoot) =>
    spawnSync("node", [scriptPath], {
      encoding: "utf8",
      env: { ...process.env, VERIFY_SAFETY_EXPIRY_ROOT: fixtureRoot },
    }),
  );
}

test("passes when expiry patterns exist", () => {
  const run = runFixture();
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:safety-expiry-tracking-coverage OK/);
});

test("fails when expiry pill function is missing", () => {
  const run = runFixture((fixtureRoot) => {
    const targets = sourceFiles.filter((rel) => rel.endsWith("driver-profile.routes.ts") || rel.endsWith("driver-qualification.routes.ts") || rel.endsWith("medical-cards.routes.ts"));
    for (const rel of targets) {
      const target = path.join(fixtureRoot, rel);
      const source = fs.readFileSync(target, "utf8");
      assert.match(source, /function expiryPill\(/);
      fs.writeFileSync(target, source.replaceAll("function expiryPill(", "function removedExpiryPill("));
    }
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /missing_pattern:pill-function/);
});
