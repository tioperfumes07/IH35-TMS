import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { attachBareOrigin, initFixtureRepo, runGitOrThrow, writeAndCommit } from "./fixtures/branch-tooling/git-fixture.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const scriptPath = path.resolve(root, "scripts/branch-precheck-push.mjs");
const minimalSteps = JSON.stringify([
  { label: "build-backend", command: "npm run build:backend" },
  { label: "verify:fixture-pass", command: "npm run verify:fixture-pass" },
  { label: "block-ready", command: "npm run block-ready" },
]);

function runScript(args, env) {
  return spawnSync("node", [scriptPath, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      BRANCH_PRECHECK_STEPS_JSON: minimalSteps,
      IH35_BRANCH_TOOLING_SKIP_FETCH: "1",
      ...env,
    },
  });
}

function writeMinimalPackage(dir) {
  fs.mkdirSync(path.join(dir, "apps/frontend"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "apps/frontend/tsconfig.json"),
    JSON.stringify({ compilerOptions: { noEmit: true }, include: [] }, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: "fixture",
        private: true,
        scripts: {
          "build:backend": "node -e \"process.exit(0)\"",
          "verify:fixture-pass": "node -e \"process.exit(0)\"",
          "block-ready": "node -e \"process.exit(0)\"",
        },
      },
      null,
      2
    ),
    "utf8"
  );
}

function makeFeatureRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ih35-precheck-"));
  initFixtureRepo(dir);
  writeMinimalPackage(dir);
  writeAndCommit(dir, "README.md", "main\n", "main");
  runGitOrThrow(["branch", "-M", "main"], { cwd: dir });
  attachBareOrigin(dir);
  runGitOrThrow(["checkout", "-b", "feat/precheck"], { cwd: dir });
  writeAndCommit(dir, "change.txt", "x\n", "feature");
  return dir;
}

test("refuses main branch", () => {
  const dir = makeFeatureRepo();
  runGitOrThrow(["checkout", "main"], { cwd: dir });
  const run = runScript([], { IH35_BRANCH_TOOLING_ROOT: dir });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /not on a feature branch/);
});

test("refuses when behind origin/main", () => {
  const dir = makeFeatureRepo();
  runGitOrThrow(["checkout", "main"], { cwd: dir });
  writeAndCommit(dir, "ahead.txt", "ahead\n", "main moved");
  runGitOrThrow(["push", "origin", "main"], { cwd: dir });
  runGitOrThrow(["checkout", "feat/precheck"], { cwd: dir });
  const run = runScript([], { IH35_BRANCH_TOOLING_ROOT: dir });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /behind origin\/main/);
});

test("runs verify chain and prints ready", () => {
  const dir = makeFeatureRepo();
  const run = runScript([], { IH35_BRANCH_TOOLING_ROOT: dir });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /READY TO PUSH: feat\/precheck/);
});

test("surfaces failing verify step", () => {
  const dir = makeFeatureRepo();
  const pkgPath = path.join(dir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  pkg.scripts["verify:fixture-fail"] = "node -e \"process.exit(1)\"";
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), "utf8");
  const failSteps = JSON.stringify([
    { label: "verify:fixture-fail", command: "npm run verify:fixture-fail" },
  ]);
  const run = runScript([], { IH35_BRANCH_TOOLING_ROOT: dir, BRANCH_PRECHECK_STEPS_JSON: failSteps });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /verify:fixture-fail/);
});
