#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FETCH_MAX_AGE_MS = 5 * 60 * 1000;

export function parseArgs(argv) {
  const args = { manifest: ".block-ready.json" };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--manifest" && argv[i + 1]) {
      args.manifest = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function runCommand(command, checkId, options = {}) {
  const cwd = options.cwd ? path.resolve(ROOT, options.cwd) : ROOT;
  console.log(`[${checkId}] RUN ${command}`);
  const res = spawnSync(command, {
    cwd,
    shell: true,
    encoding: "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
  });
  if (res.status === 0) {
    console.log(`[${checkId}] PASS ${command}`);
    return { ok: true, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
  }
  const merged = `${res.stdout ?? ""}\n${res.stderr ?? ""}`.trim();
  const tail = merged.split(/\r?\n/).slice(-20).join("\n");
  return {
    ok: false,
    reason: `${command} exited with code ${res.status}`,
    tail,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}

function fail(checkId, reason, tail = "") {
  const blockId = globalThis.__blockReadyBlockId ?? "UNKNOWN";
  console.error(`BLOCK NOT READY: ${blockId}`);
  console.error(`Failed check: ${checkId} — ${reason}`);
  if (tail) {
    console.error("Tail of failing command:");
    console.error(tail);
  }
  console.error("Do NOT push. Fix and rerun: npm run block-ready");
  process.exit(1);
}

function pass(checkId, detail) {
  if (detail) {
    console.log(`[${checkId}] PASS ${detail}`);
  }
}

export function globToRegExp(globPattern) {
  const normalized = globPattern.replace(/\\/g, "/");
  let regex = "^";
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    const next = normalized[i + 1];
    if (ch === "*" && next === "*") {
      regex += ".*";
      i += 1;
      continue;
    }
    if (ch === "*") {
      regex += "[^/]*";
      continue;
    }
    if (ch === "?") {
      regex += "[^/]";
      continue;
    }
    if (".+^${}()|[]\\".includes(ch)) {
      regex += `\\${ch}`;
      continue;
    }
    regex += ch;
  }
  regex += "$";
  return new RegExp(regex);
}

export function matchesAnyAllowedFile(filePath, patterns) {
  const normalized = filePath.replace(/\\/g, "/");
  return patterns.some((pattern) => globToRegExp(pattern).test(normalized));
}

export function validateManifest(manifest) {
  const errors = [];
  const required = {
    block_id: "string",
    phase: "string",
    task: "string",
    allowed_files: "array",
    extra_gates: "array",
    runtime_path: "enum",
    db_required: "boolean",
    guard_required: "boolean",
  };

  for (const [key, kind] of Object.entries(required)) {
    if (!(key in manifest)) {
      errors.push(`missing required field: ${key}`);
      continue;
    }
    const value = manifest[key];
    if (kind === "string" && typeof value !== "string") {
      errors.push(`${key} must be string`);
    }
    if (kind === "boolean" && typeof value !== "boolean") {
      errors.push(`${key} must be boolean`);
    }
    if (kind === "array") {
      if (!Array.isArray(value)) {
        errors.push(`${key} must be array`);
      } else if (!value.every((item) => typeof item === "string")) {
        errors.push(`${key} must contain only strings`);
      }
    }
    if (kind === "enum" && !["src", "dist", "both"].includes(value)) {
      errors.push(`${key} must be one of src|dist|both`);
    }
  }

  return errors;
}

export function parseManifest(manifestPath) {
  const absolutePath = path.resolve(ROOT, manifestPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`manifest file not found: ${manifestPath}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (error) {
    throw new Error(`manifest is not valid JSON: ${error.message}`);
  }
  const errors = validateManifest(parsed);
  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }
  return { manifest: parsed, absolutePath };
}

function readVerifyMeta() {
  const verifyMetaPath = path.resolve(ROOT, "scripts/verify-meta.json");
  if (!fs.existsSync(verifyMetaPath)) {
    return { db_gated_verify_scripts: [] };
  }
  const data = JSON.parse(fs.readFileSync(verifyMetaPath, "utf8"));
  const list = Array.isArray(data.db_gated_verify_scripts) ? data.db_gated_verify_scripts : [];
  return { db_gated_verify_scripts: list };
}

function getChangedFiles(range) {
  const res = runCommand(`git diff --name-only ${range}`, "C9");
  if (!res.ok) {
    throw new Error(res.reason);
  }
  return res.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getChangedNameStatus(range) {
  const res = runCommand(`git diff --name-status ${range}`, "C8");
  if (!res.ok) {
    throw new Error(res.reason);
  }
  return res.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split(/\s+/);
      return { status, path: rest.join(" ") };
    });
}

function getNewestMtimeMs(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return 0;
  }
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    return stat.mtimeMs;
  }
  let max = stat.mtimeMs;
  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    const candidate = getNewestMtimeMs(path.join(targetPath, entry.name));
    if (candidate > max) {
      max = candidate;
    }
  }
  return max;
}

export function evaluateGuardRequirement({ guardRequired, changedNameStatus, ciDiffText }) {
  if (!guardRequired) {
    return { ok: true, matchedGuardFiles: [], hasCiWiring: true };
  }
  const addedFiles = changedNameStatus
    .filter((item) => item.status.startsWith("A"))
    .map((item) => item.path);

  const guardFilePatterns = [
    "scripts/verify-*.mjs",
    "scripts/__tests__/verify-*.test.mjs",
    "scripts/verify-steps/*.mjs",
  ];

  const matchedGuardFiles = addedFiles.filter((filePath) =>
    guardFilePatterns.some((pattern) => globToRegExp(pattern).test(filePath))
  );

  const hasCiWiring = /^\+.*verify:/m.test(ciDiffText);

  if (matchedGuardFiles.length === 0) {
    return {
      ok: false,
      reason: "guard_required=true but no new verify guard/test/step file was added",
      matchedGuardFiles,
      hasCiWiring,
    };
  }
  if (!hasCiWiring) {
    return {
      ok: false,
      reason: "guard_required=true but ci.yml has no added verify: step",
      matchedGuardFiles,
      hasCiWiring,
    };
  }

  return { ok: true, matchedGuardFiles, hasCiWiring };
}

export function computeDbGatePlan(manifest) {
  if (manifest.db_required) {
    return { deferToCi: true, runBootSmoke: false, smokeScripts: [] };
  }
  const smokeScripts = manifest.extra_gates.filter((name) => name.startsWith("smoke:"));
  const runBootSmoke = manifest.runtime_path === "dist" || manifest.runtime_path === "both";
  return { deferToCi: false, runBootSmoke, smokeScripts };
}

function runCheckC1() {
  const branchRes = runCommand("git rev-parse --abbrev-ref HEAD", "C1");
  if (!branchRes.ok) {
    fail("C1", branchRes.reason, branchRes.tail);
  }
  const branch = branchRes.stdout.trim();
  if (["main", "master", "origin/main", "HEAD"].includes(branch)) {
    fail("C1", `must run on a non-main branch (current: ${branch})`);
  }

  const statusRes = runCommand("git status --porcelain", "C1");
  if (!statusRes.ok) {
    fail("C1", statusRes.reason, statusRes.tail);
  }
  const lines = statusRes.stdout.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith("??")) {
      fail("C1", `untracked file present: ${line.slice(3)}`);
    }
    const x = line[0] ?? " ";
    const y = line[1] ?? " ";
    const file = line.slice(3);
    if (y !== " ") {
      fail("C1", `unstaged change present: ${file}`);
    }
    if (x === " ") {
      fail("C1", `dirty file not staged: ${file}`);
    }
  }

  const fetchHeadPath = path.resolve(ROOT, ".git/FETCH_HEAD");
  let shouldFetch = true;
  if (fs.existsSync(fetchHeadPath)) {
    const age = Date.now() - fs.statSync(fetchHeadPath).mtimeMs;
    shouldFetch = age > FETCH_MAX_AGE_MS;
  }
  if (shouldFetch) {
    const fetchRes = runCommand("git fetch origin", "C1");
    if (!fetchRes.ok) {
      fail("C1", fetchRes.reason, fetchRes.tail);
    }
  }

  const mergeBaseRes = runCommand("git merge-base HEAD origin/main", "C1");
  if (!mergeBaseRes.ok) {
    fail("C1", mergeBaseRes.reason, mergeBaseRes.tail);
  }
  const originMainRes = runCommand("git rev-parse origin/main", "C1");
  if (!originMainRes.ok) {
    fail("C1", originMainRes.reason, originMainRes.tail);
  }
  const mergeBase = mergeBaseRes.stdout.trim();
  const originMain = originMainRes.stdout.trim();
  if (mergeBase !== originMain) {
    const missingRes = runCommand("git log --oneline -1 HEAD..origin/main", "C1");
    const missing = (missingRes.stdout || "").trim() || originMain;
    const mergeBranchHintMatch = missing.match(/Merge pull request #\d+ from [^/]+\/(.+)$/);
    if (mergeBranchHintMatch && mergeBranchHintMatch[1] === branch) {
      fail(
        "C1",
        `branch appears merged upstream (${missing}); run "git checkout main && git pull --ff-only origin main && git branch -D ${branch}" then start next block from main`
      );
    }
    fail("C1", `branch is not rebased onto origin/main; missing commit ${missing}`);
  }

  const mergeCommitsRes = runCommand("git rev-list --merges origin/main..HEAD", "C1");
  if (!mergeCommitsRes.ok) {
    fail("C1", mergeCommitsRes.reason, mergeCommitsRes.tail);
  }
  const mergeCommits = mergeCommitsRes.stdout.split(/\r?\n/).filter(Boolean);
  if (mergeCommits.length > 0) {
    fail("C1", `merge commit introduced on branch: ${mergeCommits[0]}`);
  }

  pass("C1", branch);
}

function runCheckC2(manifestPath) {
  try {
    const parsed = parseManifest(manifestPath);
    globalThis.__blockReadyBlockId = parsed.manifest.block_id;
    pass("C2", parsed.absolutePath);
    return parsed.manifest;
  } catch (error) {
    fail("C2", error.message);
  }
}

function runCheckC3() {
  const steps = [
    "rm -rf apps/backend/dist",
    "npm run build:backend",
    "cd apps/frontend && npx tsc -b && cd ../..",
  ];
  for (const step of steps) {
    const res = runCommand(step, "C3");
    if (!res.ok) {
      fail("C3", res.reason, res.tail);
    }
  }
}

function runCheckC4() {
  const res = runCommand("npm run verify:arch-design", "C4");
  if (!res.ok) {
    fail("C4", res.reason, res.tail);
  }
}

function runCheckC5(dbGatedVerifyScripts) {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(ROOT, "package.json"), "utf8"));
  const verifyScriptNames = Object.keys(pkg.scripts).filter((name) => name.startsWith("verify:"));
  let passed = 0;
  for (const name of verifyScriptNames) {
    if (dbGatedVerifyScripts.includes(name)) {
      console.log(`[C5] SKIP ${name} (db-gated)`);
      continue;
    }
    const res = runCommand(`npm run ${name}`, "C5");
    if (!res.ok) {
      fail("C5", `${name} failed`, res.tail);
    }
    passed += 1;
  }
  pass("C5", `${passed} verify scripts passed`);
  return passed;
}

function runCheckC6(extraGates) {
  let passed = 0;
  for (const gate of extraGates) {
    const res = runCommand(`npm run ${gate}`, "C6");
    if (!res.ok) {
      fail("C6", `${gate} failed`, res.tail);
    }
    passed += 1;
  }
  pass("C6", `${passed} extra gates passed`);
  return passed;
}

function runCheckC7(manifest) {
  const runtime = manifest.runtime_path;
  const extra = manifest.extra_gates;
  if (runtime === "dist" || runtime === "both") {
    const distCandidates = [path.resolve(ROOT, "apps/backend/dist"), path.resolve(ROOT, "dist")];
    const distPath = distCandidates.find((candidate) => fs.existsSync(candidate));
    if (!distPath) {
      fail("C7", "runtime_path requires dist but neither apps/backend/dist nor dist/ exists");
    }
    const srcNewest = getNewestMtimeMs(path.resolve(ROOT, "apps/backend/src"));
    const distNewest = getNewestMtimeMs(distPath);
    if (distNewest < srcNewest) {
      fail("C7", `${path.relative(ROOT, distPath)} is older than apps/backend/src; run build first`);
    }
    const distGates = extra.filter((name) => /dist|smoke|autoload-coverage/i.test(name));
    for (const gate of distGates) {
      const res = runCommand(`npm run ${gate}`, "C7");
      if (!res.ok) {
        fail("C7", `dist runtime gate failed: ${gate}`, res.tail);
      }
    }
  }

  if (runtime === "src" || runtime === "both") {
    const srcGates = extra.filter((name) => /src/i.test(name));
    for (const gate of srcGates) {
      const res = runCommand(`npm run ${gate}`, "C7");
      if (!res.ok) {
        fail("C7", `src runtime gate failed: ${gate}`, res.tail);
      }
    }
  }

  pass("C7", runtime);
}

function runCheckC8(manifest, range) {
  const changedNameStatus = getChangedNameStatus(range);
  const ciDiffRes = runCommand(`git diff ${range} -- .github/workflows/ci.yml`, "C8");
  if (!ciDiffRes.ok) {
    fail("C8", ciDiffRes.reason, ciDiffRes.tail);
  }
  const result = evaluateGuardRequirement({
    guardRequired: manifest.guard_required,
    changedNameStatus,
    ciDiffText: ciDiffRes.stdout,
  });

  if (!result.ok) {
    fail("C8", result.reason);
  }

  if (manifest.guard_required) {
    pass("C8", `matched guard files: ${result.matchedGuardFiles.join(", ")}`);
  } else {
    pass("C8", "guard not required");
  }
}

function runCheckC9(manifest, range) {
  const changed = getChangedFiles(range);
  const outOfScope = changed.filter((filePath) => !matchesAnyAllowedFile(filePath, manifest.allowed_files));
  if (outOfScope.length > 0) {
    fail("C9", `out-of-scope changed files: ${outOfScope.join(", ")}`);
  }
  pass("C9", `${changed.length} changed files within allowed scope`);
  return changed.length;
}

function runCheckC10(manifest) {
  const plan = computeDbGatePlan(manifest);
  if (plan.deferToCi) {
    console.log(
      "DB-gated checks deferred to CI per Standing Order #16 v2. Do NOT run locally with substituted DB."
    );
    pass("C10", "deferred");
    return "deferred";
  }

  if (plan.runBootSmoke) {
    const boot = runCommand("npm run ci:boot-api-smoke", "C10");
    if (!boot.ok) {
      fail("C10", "ci:boot-api-smoke failed", boot.tail);
    }
  }

  for (const smokeScript of plan.smokeScripts) {
    const res = runCommand(`npm run ${smokeScript}`, "C10");
    if (!res.ok) {
      fail("C10", `${smokeScript} failed`, res.tail);
    }
  }

  pass("C10", "local-passed");
  return "local-passed";
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  runCheckC1();
  const manifest = runCheckC2(args.manifest);
  const verifyMeta = readVerifyMeta();

  runCheckC3();
  runCheckC4();
  const verifyCount = runCheckC5(verifyMeta.db_gated_verify_scripts);
  const extraCount = runCheckC6(manifest.extra_gates);
  runCheckC7(manifest);

  const range = "origin/main..HEAD";
  runCheckC8(manifest, range);
  const changedCount = runCheckC9(manifest, range);
  const dbGate = runCheckC10(manifest);

  console.log(`BLOCK READY: ${manifest.block_id}`);
  console.log(`Allowed files changed: ${changedCount}`);
  console.log(`Verify gates passed:   ${verifyCount}`);
  console.log(`Extra gates passed:    ${extraCount}`);
  console.log(`Runtime parity:        ${manifest.runtime_path}`);
  console.log(`DB gate:               ${dbGate}`);
  console.log("New SHA when pushed will be ready to merge once CI is green.");
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main();
}
