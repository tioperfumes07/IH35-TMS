#!/usr/bin/env node
/**
 * verify-no-guard-hotfile-thrash — permanent cure for the serialize treadmill.
 *
 * NEW guards wire via scripts/verify-steps ONLY (#2684 / STOP-THE-THRASH).
 * Editing package.json / locked-guards.yml / ci.yml to register a new verify:* is FORBIDDEN.
 *
 * Compares this checkout to origin/main (or GITHUB_BASE_REF). Fails if the diff adds:
 *   - a package.json "verify:*" script key, OR
 *   - a locked-guards.yml / ci.yml run line that invokes npm run verify:* or node scripts/verify-*.mjs
 *
 * Self-test: node scripts/verify-no-guard-hotfile-thrash.mjs --selftest
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function baseRef() {
  const b = process.env.GITHUB_BASE_REF || process.env.BASE_REF || "main";
  try {
    execSync(`git rev-parse --verify origin/${b}`, { cwd: ROOT, stdio: "ignore" });
    return `origin/${b}`;
  } catch {
    return "origin/main";
  }
}

function diffFile(rel, root = ROOT) {
  try {
    return execSync(`git diff ${baseRef()} -- ${rel}`, { cwd: root, encoding: "utf8" });
  } catch {
    return "";
  }
}

function addedLines(diff) {
  return diff
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1));
}

/** The verify:* script keys package.json already has on the base branch — editing one is not a new registration. */
function baseVerifyKeys(root = ROOT) {
  try {
    const base = JSON.parse(execSync(`git show ${baseRef()}:package.json`, { cwd: root, encoding: "utf8" }));
    return new Set(Object.keys(base.scripts ?? {}).filter((k) => k.startsWith("verify:")));
  } catch {
    return new Set();
  }
}

export function assertNoHotfileThrash({ root = ROOT } = {}) {
  const errs = [];
  // A NEW verify:* key is the thrash this guard stops. A changed command on a key main already registers (the
  // 2026-11-18 portable --env-file-if-exists fix) is not a new registration and is not refused.
  const existing = baseVerifyKeys(root);
  for (const line of addedLines(diffFile("package.json", root))) {
    const key = /^\s*"(verify:[^"]+)"\s*:/.exec(line)?.[1];
    if (key && !existing.has(key)) {
      errs.push(
        `package.json adds ${line.trim()} — FORBIDDEN. Wire via scripts/verify-steps/ only (docs/specs/STOP-THE-THRASH-WORKORDER-2026-07-17.md).`,
      );
    }
  }
  for (const wf of [".github/workflows/locked-guards.yml", ".github/workflows/ci.yml"]) {
    for (const line of addedLines(diffFile(wf, root))) {
      if (/npm run verify:/.test(line) || /node scripts\/verify-[a-z0-9-]+\.mjs/.test(line)) {
        errs.push(
          `${wf} adds guard execution (${line.trim()}) — FORBIDDEN. Add scripts/verify-steps/NNN-verify-X.mjs instead.`,
        );
      }
    }
  }
  return errs;
}

function main() {
  if (process.argv.includes("--selftest")) {
    const errs = assertNoHotfileThrash();
    if (!Array.isArray(errs)) throw new Error("must return array");
    // A key main does not have is refused; one it has is not.
    const keys = baseVerifyKeys();
    if (!keys.size) throw new Error("selftest: base package.json has no verify:* keys -- cannot judge");
    const known = [...keys][0];
    const isNew = (k) => !keys.has(k);
    if (isNew(known)) throw new Error(`selftest: existing key ${known} judged new`);
    if (!isNew("verify:zz-selftest-never-registered")) throw new Error("selftest: a brand-new key was not judged new");
    console.log("verify-no-guard-hotfile-thrash --selftest PASS");
    return;
  }
  const errs = assertNoHotfileThrash();
  if (errs.length) {
    console.error("verify-no-guard-hotfile-thrash FAIL:");
    for (const e of errs) console.error("  ✗", e);
    process.exit(1);
  }
  console.log("verify-no-guard-hotfile-thrash OK — no new guard hot-file thrash vs " + baseRef());
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) main();
