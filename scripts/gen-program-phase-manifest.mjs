#!/usr/bin/env node
/**
 * gen-program-phase-manifest.mjs — regenerates docs/trackers/program-phase-manifest.json
 *
 * The Program Tracker's phase DENOMINATOR = the authored MASTER-6 build sequence (the stable 8-phase
 * structure), which lives outside the repo (owner's package). This generator maps each authored block-id
 * to one of the 8 phases and flags whether it is REGISTERED yet in .block-ready/ (best-effort normalized
 * id match). The committed manifest is the deployed artifact; the /api/v1/program/tracker endpoint overlays
 * genuinely-live signals (reconcile status, SHA, merged PRs, held count) on top at request time.
 *
 * Numbers are never hand-edited — regenerate: node scripts/gen-program-phase-manifest.mjs "<MASTER-6 path>"
 * (defaults to ~/Downloads/MASTER 6). If the MASTER-6 path is absent, the existing manifest's authored
 * lists are preserved and ONLY the `registered` flags are refreshed from the live .block-ready set.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import process from "node:process";

const repoRoot = process.cwd();
const OUT = "docs/trackers/program-phase-manifest.json";
const BLOCK_READY_DIR = path.join(repoRoot, ".block-ready");

// The 8 phases in execution order, mapped to their MASTER-6 source folders (folder = authored source).
const PHASES = [
  { n: 1, key: "enforcement", label: "Enforcement (G1–G4 + SKILL-LINKAGE)", dir: "01-ENFORCEMENT-FIRST" },
  { n: 2, key: "money-wiring", label: "Money-wiring P1–P3", dir: "02-MONEY-WIRING-P1-P3" },
  { n: 3, key: "held-fk", label: "Held FK migrations (money + Phase-4)", dir: null }, // cross-cutting; from .held-migrations.json
  { n: 4, key: "phase4", label: "Phase-4 cross-module (safety/insurance/legal, maint)", dir: "04-PHASE4-CROSS-MODULE" },
  { n: 5, key: "tier1", label: "Tier-1 remainder", dir: "03-TIER1-BLOCKS" },
  { n: 6, key: "tier2", label: "Tier-2", dir: "05-TIER2-BLOCKS" },
  { n: 7, key: "tier3", label: "Tier-3 (UI / docs / tests — ship on green)", dir: "06-TIER3-BLOCKS" },
  { n: 8, key: "design-parity", label: "Design-parity (owner UI locks)", dir: "07-UI-DESIGN" },
];

function normId(s) {
  return String(s)
    .replace(/\.(txt|json)$/i, "")
    .replace(/_DISPATCH$|_VERIFY$/i, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function registeredKeys() {
  const list = [];
  if (!fs.existsSync(BLOCK_READY_DIR)) return list;
  for (const f of fs.readdirSync(BLOCK_READY_DIR)) {
    if (!f.endsWith(".json")) continue;
    list.push({ key: f.replace(/\.json$/, ""), n: normId(f) });
  }
  return list;
}

// Best-effort match of an authored block-id to a .block-ready registry key: exact normalized-id equality
// first, else a strong shared-core substring (>=10 chars) either direction. Returns the registry key or null.
function matchRegistered(authoredId, reg) {
  const a = normId(authoredId);
  const exact = reg.find((r) => r.n === a);
  if (exact) return exact.key;
  const core = a.replace(/^[0-9]+/, "");
  if (core.length < 10) return null;
  const c = core.slice(0, 14);
  const loose = reg.find((r) => (r.n.includes(c) || a.includes(r.n.slice(0, 14))) && r.n.replace(/^[0-9]+/, "").length >= 10);
  return loose ? loose.key : null;
}

function main() {
  const master6 = process.argv[2] || path.join(os.homedir(), "Downloads", "MASTER 6");
  const reg = registeredKeys();
  const prior = fs.existsSync(path.join(repoRoot, OUT))
    ? JSON.parse(fs.readFileSync(path.join(repoRoot, OUT), "utf8"))
    : null;

  const phases = [];
  for (const p of PHASES) {
    let blockIds = [];
    if (p.dir && fs.existsSync(path.join(master6, p.dir))) {
      blockIds = fs
        .readdirSync(path.join(master6, p.dir))
        .filter((f) => f.endsWith(".txt"))
        .map((f) => f.replace(/\.txt$/, ""))
        .sort();
    } else if (prior) {
      // MASTER-6 absent (e.g. CI): preserve prior authored list, refresh registered flags only.
      const pr = (prior.phases || []).find((x) => x.key === p.key);
      blockIds = pr ? pr.blocks.map((b) => b.id) : [];
    }
    const blocks = blockIds.map((id) => {
      const key = matchRegistered(id, reg);
      return key ? { id, registered: true, block_ready_key: key } : { id, registered: false };
    });
    phases.push({ n: p.n, key: p.key, label: p.label, authored_total: blocks.length, registered_count: blocks.filter((b) => b.registered).length, blocks });
  }

  const authored_total = phases.reduce((a, p) => a + p.authored_total, 0);
  const registered_total = phases.reduce((a, p) => a + p.registered_count, 0);
  const manifest = {
    // generated_at is stamped by the committer via --stamp to keep this deterministic in git otherwise.
    schema: "program-phase-manifest/v1",
    source: "MASTER-6 authored build sequence + live .block-ready registration flags",
    authored_total,
    registered_total,
    not_registered_total: authored_total - registered_total,
    phases,
  };
  fs.writeFileSync(path.join(repoRoot, OUT), JSON.stringify(manifest, null, 1) + "\n");
  console.log(`[gen-program-phase-manifest] wrote ${OUT} — ${authored_total} authored, ${registered_total} registered across ${phases.length} phases`);
}

main();
