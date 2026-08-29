#!/usr/bin/env node
/**
 * H2 companion — every stored generated artifact is either in DERIVED-ARTIFACTS.json
 * or GENERATED-ARTIFACT-EXEMPT.json. An unregistered generated file FAILS.
 *
 * Discovery is GLOB-driven (Honesty Program H2 widen): committed files whose header
 * says GENERATED / do-not-hand-edit / Produced by scripts, plus known snapshot paths.
 *
 * Run: node scripts/verify-generated-artifact-registry.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-generated-artifact-registry";
const DERIVED = path.join(ROOT, "docs/specs/DERIVED-ARTIFACTS.json");
const EXEMPT = path.join(ROOT, "docs/specs/GENERATED-ARTIFACT-EXEMPT.json");
const SELFTEST = process.argv.includes("--selftest");

const SKIP_DIR = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  "tmp",
]);

const HEADER_RE = /GENERATED FILE|do not hand-edit|Do not hand-edit|Produced by scripts\//i;

const EXTRA_SNAPSHOTS = [
  "docs/audit/program-scoreboard.json",
  "docs/specs/scoreboard/verifier-rollup.json",
];

export function looksGenerated(rel, head) {
  if (EXTRA_SNAPSHOTS.includes(rel)) return true;
  return HEADER_RE.test(head);
}

export function analyse({ derivedPaths, exemptPaths, discovered }) {
  const covered = new Set([...derivedPaths, ...exemptPaths]);
  const problems = [];
  for (const p of discovered) {
    if (!covered.has(p)) {
      problems.push(
        `${p}: generated-looking file not in DERIVED-ARTIFACTS or GENERATED-ARTIFACT-EXEMPT. Silence is not a pass.`
      );
    }
  }
  return { problems };
}

function walk(dir, out) {
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of ents) {
    if (e.name.startsWith(".") && e.name !== ".ledger.json") continue;
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue;
      walk(path.join(dir, e.name), out);
      continue;
    }
    if (!/\.(json|ts|tsx|mjs)$/.test(e.name)) continue;
    const abs = path.join(dir, e.name);
    const rel = path.relative(ROOT, abs).split(path.sep).join("/");
    let head = "";
    try {
      const fd = fs.openSync(abs, "r");
      const buf = Buffer.alloc(2048);
      const n = fs.readSync(fd, buf, 0, 2048, 0);
      fs.closeSync(fd);
      head = buf.slice(0, n).toString("utf8");
    } catch {
      continue;
    }
    if (looksGenerated(rel, head)) out.push(rel);
  }
}

export function discoverGenerated(root = ROOT) {
  const found = [];
  for (const top of ["docs", "apps/frontend/src/pages/program", "db/migrations"]) {
    const abs = path.join(root, top);
    if (fs.existsSync(abs)) walk(abs, found);
  }
  return [...new Set(found)].sort();
}

function selftest() {
  const T = [];
  const t = (n, f) => {
    try {
      f();
      T.push([n, true]);
    } catch (e) {
      T.push([n, false, e.message]);
    }
  };
  t("registered PASS", () => {
    const r = analyse({ derivedPaths: ["a.json"], exemptPaths: [], discovered: ["a.json"] });
    if (r.problems.length) throw new Error("expected 0");
  });
  t("unregistered FAILS", () => {
    const r = analyse({ derivedPaths: [], exemptPaths: [], discovered: ["orphan.json"] });
    if (!r.problems[0]?.includes("orphan.json")) throw new Error(String(r.problems));
  });
  t("exempt PASS", () => {
    const r = analyse({ derivedPaths: [], exemptPaths: ["orphan.json"], discovered: ["orphan.json"] });
    if (r.problems.length) throw new Error("expected 0");
  });
  t("looksGenerated header", () => {
    if (!looksGenerated("x.ts", "// GENERATED FILE — do not hand-edit.\n")) throw new Error("header");
  });
  t("looksGenerated extra snapshot", () => {
    if (!looksGenerated("docs/audit/program-scoreboard.json", "{}")) throw new Error("snapshot");
  });
  t("authored json is not generated", () => {
    if (looksGenerated("docs/specs/foo.json", '{ "note": "authored" }\n')) throw new Error("false positive");
  });
  const failed = T.filter((x) => !x[1]);
  for (const row of T) console.log(`${row[1] ? "PASS" : "FAIL"} ${row[0]}${row[2] ? " — " + row[2] : ""}`);
  if (failed.length) process.exit(1);
  console.log(`${LABEL} --selftest ${T.length}/${T.length} ok`);
}

function main() {
  if (SELFTEST) return selftest();
  if (!fs.existsSync(DERIVED) || !fs.existsSync(EXEMPT)) {
    console.error(`${LABEL} FAIL CLOSED missing registry files`);
    process.exit(1);
  }
  const derived = JSON.parse(fs.readFileSync(DERIVED, "utf8"));
  const exempt = JSON.parse(fs.readFileSync(EXEMPT, "utf8"));
  const derivedPaths = (derived.artifacts || []).map((a) => a.path);
  const exemptPaths = (exempt.paths || []).map((a) => a.path);
  const discovered = discoverGenerated();
  const r = analyse({ derivedPaths, exemptPaths, discovered });
  if (r.problems.length) {
    for (const p of r.problems) console.error(`  ${p}`);
    console.error(`${LABEL} FAIL ${r.problems.length} unregistered generated file(s)`);
    process.exit(1);
  }
  console.log(
    `${LABEL} PASS discovered=${discovered.length} derived=${derivedPaths.length} exempt=${exemptPaths.length}`
  );
}

main();
