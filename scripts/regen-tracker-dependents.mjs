#!/usr/bin/env node
/**
 * Regenerate every REGISTERED derived artifact that is built from the files the Program Tracker
 * auto-refresh rewrites (docs/trackers/block-reconciliation-data.json, docs/trackers/program-phase-manifest.json).
 *
 * WHY (ACCT-F11100 follow-up, 2026-11-09): program-tracker-artifacts-sync.yml refreshed the reconcile JSON
 * (#28631 moved recon.date to 2026-11-10) but nothing regenerated docs/trackers/financial-block-buildability.{md,csv},
 * whose title is built from that JSON. verify-derived-artifact-freshness --strict then failed
 * required-live-load-guard on main b864c6b: "STALE — docs/trackers/financial-block-buildability.md".
 * Every refresh of an input must regenerate the artifacts built from it in the same commit.
 *
 * The dependency list is READ from docs/specs/DERIVED-ARTIFACTS.json (`generated[].inputs` / `watch`), never
 * hand-copied here, so a new artifact registered against these inputs is regenerated without editing this file.
 *
 *   node scripts/regen-tracker-dependents.mjs [--paths-file <file>]   (writes one regenerated path per line)
 *   node scripts/regen-tracker-dependents.mjs --list                   (prints the dependents, runs nothing)
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REGISTRY_PATH = "docs/specs/DERIVED-ARTIFACTS.json";
export const TRACKER_SYNC_OUTPUTS = [
  "docs/trackers/block-reconciliation-data.json",
  "docs/trackers/program-phase-manifest.json",
];

/** Registered generated artifacts whose inputs or watch paths include a tracker-sync output. */
export function trackerDependents(registry, refreshed = TRACKER_SYNC_OUTPUTS) {
  const set = new Set(refreshed);
  return (registry?.generated ?? []).filter((e) => {
    const ins = [...(e.inputs ?? []), ...(e.watch ?? [])];
    return ins.some((p) => set.has(p));
  });
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, REGISTRY_PATH), "utf8"));
  const deps = trackerDependents(registry);
  if (process.argv.includes("--list")) {
    for (const e of deps) console.log(`${e.generator} -> ${(e.paths ?? []).join(", ")}`);
    process.exit(0);
  }
  const paths = [];
  for (const e of deps) {
    if (!e.regenerate) {
      console.error(`regen-tracker-dependents: ${e.generator} is registered against a tracker-sync output but has no "regenerate" command`);
      process.exit(1);
    }
    console.log(`regen-tracker-dependents: ${e.regenerate}`);
    execSync(e.regenerate, { cwd: ROOT, stdio: "inherit" });
    paths.push(...(e.paths ?? []));
  }
  const i = process.argv.indexOf("--paths-file");
  if (i !== -1) fs.writeFileSync(process.argv[i + 1], paths.map((p) => `${p}\n`).join(""));
  console.log(`regen-tracker-dependents: regenerated ${deps.length} artifact(s), ${paths.length} path(s)`);
}
