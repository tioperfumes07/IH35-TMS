#!/usr/bin/env node
/** @ratchet — posting-contract declaration integrity only; live reversal remains separate. */
/** @matrix-built {"modules":["accounting","banking","cash-flow","customers","dispatch","drivers","factoring","finance","fleet","insurance","legal","lists","maintenance","safety","settlements","vendors"],"cols":["reversal_symmetry"],"leaves":["economics.invariants"],"task":"ECON-C28-INV-11-WRAPPER"} */
/**
 * H5 — reversal_symmetry producer is registry-driven (same POSTING-CONTRACTS as H1).
 * Drawn is not computed. Every path must declare reversal.mode + surfaces.
 * Live post→reverse→restore waits on SCEN-01 chains (producer: pending_scen01_chains).
 *
 * Run: node scripts/verify-reversal-symmetry.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-reversal-symmetry";
const CONTRACTS_PATH = path.join(ROOT, "docs/specs/accounting/POSTING-CONTRACTS.json");
const SELFTEST = process.argv.includes("--selftest");

export function analyse(doc) {
  const problems = [];
  if (!doc?.paths?.length) {
    problems.push("POSTING-CONTRACTS.json missing paths — fail closed");
    return { problems };
  }
  for (const p of doc.paths) {
    if (!p.reversal) problems.push(`${p.flag}: no reversal object — C28 has nothing to compute`);
    else {
      if (!p.reversal.mode) problems.push(`${p.flag}: reversal.mode missing`);
      if (!Array.isArray(p.reversal.surfaces) || p.reversal.surfaces.length === 0) {
        problems.push(`${p.flag}: reversal.surfaces empty`);
      }
      if (!p.reversal.producer) problems.push(`${p.flag}: reversal.producer missing (drawn ≠ computed)`);
    }
  }
  return { problems, n: doc.paths.length };
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
  const doc = JSON.parse(fs.readFileSync(CONTRACTS_PATH, "utf8"));
  t("clean PASS", () => {
    const r = analyse(doc);
    if (r.problems.length) throw new Error(r.problems.join(" | "));
  });
  t("missing reversal FAILS", () => {
    const paths = doc.paths.map((p, i) => (i === 0 ? { ...p, reversal: undefined } : p));
    const r = analyse({ ...doc, paths });
    if (!r.problems.some((x) => x.includes("no reversal"))) throw new Error(r.problems.join());
  });
  t("empty surfaces FAILS", () => {
    const paths = doc.paths.map((p, i) =>
      i === 0 ? { ...p, reversal: { ...p.reversal, surfaces: [] } } : p
    );
    const r = analyse({ ...doc, paths });
    if (!r.problems.some((x) => x.includes("surfaces"))) throw new Error(r.problems.join());
  });
  const failed = T.filter((x) => !x[1]);
  for (const row of T) console.log(`${row[1] ? "PASS" : "FAIL"} ${row[0]}${row[2] ? " — " + row[2] : ""}`);
  if (failed.length) process.exit(1);
  console.log(`${LABEL} --selftest ${T.length}/${T.length} ok`);
}

function main() {
  if (SELFTEST) return selftest();
  if (!fs.existsSync(CONTRACTS_PATH)) {
    console.error(`${LABEL} FAIL CLOSED missing contracts`);
    process.exit(1);
  }
  const r = analyse(JSON.parse(fs.readFileSync(CONTRACTS_PATH, "utf8")));
  if (r.problems.length) {
    for (const p of r.problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS ${r.n} paths declare reversal (live restore still pending_scen01_chains)`);
}

main();
