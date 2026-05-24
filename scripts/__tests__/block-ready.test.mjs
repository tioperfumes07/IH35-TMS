import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeDbGatePlan,
  evaluateGuardRequirement,
  matchesAnyAllowedFile,
  parseManifest,
  validateManifest,
} from "../block-ready.mjs";

test("valid manifest passes validation", () => {
  const manifest = {
    block_id: "MAGNET-4-FINAL",
    phase: "Refactor",
    task: "MAGNET-4",
    allowed_files: ["scripts/**"],
    extra_gates: ["verify:accounting-autoload-coverage"],
    runtime_path: "both",
    db_required: true,
    guard_required: true,
  };
  assert.deepEqual(validateManifest(manifest), []);
});

test("missing required field fails with field name", () => {
  const manifest = {
    phase: "Refactor",
    task: "MAGNET-4",
    allowed_files: [],
    extra_gates: [],
    runtime_path: "both",
    db_required: true,
    guard_required: true,
  };
  const errors = validateManifest(manifest);
  assert.ok(errors.some((err) => err.includes("block_id")));
});

test("invalid runtime_path enum fails", () => {
  const manifest = {
    block_id: "X",
    phase: "Tooling",
    task: "X",
    allowed_files: [],
    extra_gates: [],
    runtime_path: "invalid",
    db_required: false,
    guard_required: false,
  };
  const errors = validateManifest(manifest);
  assert.ok(errors.some((err) => err.includes("runtime_path")));
});

test("allowed-files glob accepts and rejects expected paths", () => {
  const patterns = ["scripts/**", "package.json"];
  assert.equal(matchesAnyAllowedFile("scripts/block-ready.mjs", patterns), true);
  assert.equal(matchesAnyAllowedFile("apps/backend/src/index.ts", patterns), false);
});

test("guard_required=true with no guard file in changeset fails", () => {
  const result = evaluateGuardRequirement({
    guardRequired: true,
    changedNameStatus: [{ status: "M", path: "package.json" }],
    ciDiffText: "+      - name: verify something",
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /no new verify guard/i);
});

test("db_required=true skips ci:boot-api-smoke", () => {
  const plan = computeDbGatePlan({
    runtime_path: "both",
    db_required: true,
    extra_gates: ["smoke:accounting"],
  });
  assert.equal(plan.deferToCi, true);
  assert.equal(plan.runBootSmoke, false);
  assert.deepEqual(plan.smokeScripts, []);
});

test("parseManifest reads existing JSON file", () => {
  const parsed = parseManifest("docs/block-ready-examples/MAGNET-4-FINAL.json");
  assert.equal(parsed.manifest.block_id, "MAGNET-4-FINAL");
});
