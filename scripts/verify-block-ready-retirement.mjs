#!/usr/bin/env node
/**
 * Guard: .block-ready retirement must not false-retire live hyphen defect IDs.
 * Rule 17 auto-discovered via scripts/verify-steps/911-verify-block-ready-retirement.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { runExecutableGuard } from "./guard-executable-contract.mjs";
import {
  CONFIRMED_LIVE_HYPHEN_DEFECT_IDS,
  isRetiredBlockFile,
  RETIRE_FILENAME,
} from "./lib/block-ready-retirement.mjs";

const ROOT = process.cwd();
const LABEL = "verify-block-ready-retirement";
const BR_DIR = path.join(ROOT, ".block-ready");
const RECONCILE = "scripts/reconcile-block-status.mjs";
const TRACKER_GUARD = "scripts/verify-tracker-no-duplicate-block-ids.mjs";
const PROGRAM_TRACKER = "apps/backend/src/program/program-tracker.service.ts";
const SHARED = "scripts/lib/block-ready-retirement.mjs";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function checker(fixture) {
  const failures = [];

  if (!fixture.sharedSource.includes("RETIRE_FILENAME") || !fixture.sharedSource.includes("isRetiredBlockFile")) {
    failures.push("shared retirement helper is missing exports");
  }
  if (!/_\(DUP\|DUPLICATE\|LIKELY-STALE\|STALE\|SUPERSEDED\)/.test(fixture.sharedSource)) {
    failures.push("shared retirement helper must use underscore-only filename markers");
  }
  if (/\[_-\]\(DUP\|DUPLICATE\|STALE/.test(fixture.sharedSource)) {
    failures.push("shared retirement helper must not use hyphen+STALE/DUPLICATE filename retirement");
  }

  if (!fixture.reconcileSource.includes('from "./lib/block-ready-retirement.mjs"')) {
    failures.push("reconcile-block-status.mjs must import shared isRetiredBlockFile");
  }
  if (/const RETIRE_FILENAME\s*=\s*\/\[_-\]/.test(fixture.reconcileSource)) {
    failures.push("reconcile-block-status.mjs must not redefine the old hyphen retirement regex");
  }

  if (!fixture.trackerGuardSource.includes('from "./lib/block-ready-retirement.mjs"')) {
    failures.push("verify-tracker-no-duplicate-block-ids.mjs must import shared helper");
  }

  if (!/_\(DUP\|DUPLICATE\|LIKELY-STALE\|STALE\|SUPERSEDED\)\\.json\$/.test(fixture.programTrackerSource)) {
    failures.push("program-tracker.service.ts must use underscore-only retirement filename regex");
  }
  if (/\[_-\]\(DUP\|DUPLICATE\|STALE\|LIKELY-STALE\|SUPERSEDED\)\\.json\$/.test(fixture.programTrackerSource)) {
    failures.push("program-tracker.service.ts must not keep the old hyphen retirement regex");
  }

  for (const id of fixture.liveIds) {
    const file = `${id}.json`;
    const json = fixture.registry[file];
    if (!json) {
      failures.push(`missing live registry file ${file}`);
      continue;
    }
    if (isRetiredBlockFile(file, json)) {
      failures.push(`false retirement: live defect id ${id} was retired`);
    }
  }

  for (const [file, json] of Object.entries(fixture.retiredSamples)) {
    if (!isRetiredBlockFile(file, json)) {
      failures.push(`expected explicit retirement marker to exclude ${file}`);
    }
  }

  // Planted regression: hyphen descriptive tails must stay live under the helper.
  if (isRetiredBlockFile("mirror-workers-stale.json", { status: "PARTIAL" })) {
    failures.push("helper retired hyphen descriptive -stale id");
  }
  if (isRetiredBlockFile("row-duplicate.json", { status: "PENDING" })) {
    failures.push("helper retired hyphen descriptive -duplicate id");
  }

  if (!RETIRE_FILENAME.test("x_DUP") || !RETIRE_FILENAME.test("x_SUPERSEDED")) {
    failures.push("RETIRE_FILENAME must match underscore _DUP/_SUPERSEDED markers");
  }
  if (RETIRE_FILENAME.test("x-stale") || RETIRE_FILENAME.test("x-duplicate")) {
    failures.push("RETIRE_FILENAME must not match hyphen descriptive -stale/-duplicate");
  }

  // Artifact integrity: committed reconcile data must still list the five live IDs (no silent drop).
  for (const id of fixture.liveIds) {
    if (!fixture.artifactIds.has(id)) {
      failures.push(`block-reconciliation-data.json missing live id ${id}`);
    }
  }

  return failures;
}

function loadRepositoryFixture() {
  const registry = {};
  for (const id of CONFIRMED_LIVE_HYPHEN_DEFECT_IDS) {
    const file = `${id}.json`;
    const full = path.join(BR_DIR, file);
    registry[file] = JSON.parse(fs.readFileSync(full, "utf8"));
  }
  const retiredSamples = {};
  for (const file of [
    "0008-g4-vendor-namespace-canonical_DUP.json",
    "0008-a-gl-flags-settlement-lease-off_SUPERSEDED.json",
    "0010-f11-jep-duplicate-idempotency-gro_STALE.json",
  ]) {
    retiredSamples[file] = JSON.parse(fs.readFileSync(path.join(BR_DIR, file), "utf8"));
  }
  const artifact = JSON.parse(read("docs/trackers/block-reconciliation-data.json"));
  return {
    liveIds: [...CONFIRMED_LIVE_HYPHEN_DEFECT_IDS],
    registry,
    retiredSamples,
    artifactIds: new Set((artifact.blocks ?? []).map((b) => b.id)),
    sharedSource: read(SHARED),
    reconcileSource: read(RECONCILE),
    trackerGuardSource: read(TRACKER_GUARD),
    programTrackerSource: read(PROGRAM_TRACKER),
  };
}

function createBadFixture(good) {
  const bad = structuredClone(good);
  // Plant old hyphen retirement regex back into shared helper source text checks.
  bad.sharedSource = bad.sharedSource.replace(
    "/_(DUP|DUPLICATE|LIKELY-STALE|STALE|SUPERSEDED)$/i",
    "/[_-](DUP|DUPLICATE|STALE|LIKELY-STALE|SUPERSEDED)$/i"
  );
  bad.reconcileSource = bad.reconcileSource.replace(
    'from "./lib/block-ready-retirement.mjs"',
    'from "./missing-retirement.mjs"'
  );
  bad.programTrackerSource = bad.programTrackerSource.replace(
    "/_(DUP|DUPLICATE|LIKELY-STALE|STALE|SUPERSEDED)\\.json$/i",
    "/[_-](DUP|DUPLICATE|STALE|LIKELY-STALE|SUPERSEDED)\\.json$/i"
  );
  // Drop one live id from artifact to prove drop detection.
  bad.artifactIds = new Set([...bad.artifactIds].filter((id) => id !== bad.liveIds[0]));
  // Force false retirement on a live registry row via explicit status (simulates bad status write).
  const first = `${bad.liveIds[0]}.json`;
  bad.registry[first] = { ...bad.registry[first], status: "stale" };
  return bad;
}

const goodFixture = loadRepositoryFixture();
const badFixture = createBadFixture(goodFixture);

runExecutableGuard({
  label: LABEL,
  checker,
  loadRepositoryFixture,
  goodFixture,
  badFixture,
  expectedBadViolationSubstrings: [
    "underscore-only",
    "must import shared isRetiredBlockFile",
    "false retirement",
    "missing live id",
    "must not keep the old hyphen retirement regex",
  ],
});
