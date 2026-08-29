#!/usr/bin/env node
/**
 * H2 companion — every stored generated artifact is either in DERIVED-ARTIFACTS.json
 * or GENERATED-ARTIFACT-EXEMPT.json. An unregistered generated file FAILS.
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

const MUST_REGISTER = [
  "docs/audit/program-scoreboard.json",
  "docs/specs/scoreboard/verifier-rollup.json",
];

export function analyse({ derivedPaths, exemptPaths, discovered }) {
  const covered = new Set([...derivedPaths, ...exemptPaths]);
  const problems = [];
  for (const p of discovered) {
    if (!covered.has(p)) problems.push(`${p}: generated-looking file not in DERIVED-ARTIFACTS or GENERATED-ARTIFACT-EXEMPT. Silence is not a pass.`);
  }
  return { problems };
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
  const r = analyse({ derivedPaths, exemptPaths, discovered: MUST_REGISTER });
  if (r.problems.length) {
    for (const p of r.problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS discovered=${MUST_REGISTER.length} derived=${derivedPaths.length} exempt=${exemptPaths.length}`);
}

main();
