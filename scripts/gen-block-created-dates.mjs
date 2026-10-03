#!/usr/bin/env node
/**
 * FIX B — generate docs/trackers/block-created-dates.json: for each .block-ready/*.json block, its TRUE
 * creation date = the first commit that ADDED that file (git). Blocks have no reliable created_at field
 * (verified: ~2 of ~1,331 carry one, inconsistent) — so we derive it from git, never invent it.
 *
 * The prod backend has no git, so this map is generated in CI (where git exists) and shipped/uploaded
 * alongside the reconcile artifact; the live tracker reads it to power the "Since Jul 1" filtered view.
 * A block whose add-date can't be determined is recorded as null → labeled "undated", never guessed into
 * the window.
 *
 * Output: { generated_at_iso, count, dated, undated, dates: { "<block-id>": "YYYY-MM-DD" | null } }
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BR_DIR = path.join(ROOT, ".block-ready");
const OUT = path.join(ROOT, "docs/trackers/block-created-dates.json");

// ROUND 363-CC3-C — ONE pass over history instead of one `git log --follow` per file (1,430 files took 210s, which kept
// this artifact out of the freshness check). Oldest commit first: an add (A) stamps the file's date; a rename (R) carries
// the old path's date to the new path. Compared with the old per-file `--follow` output on all 1,413 blocks: 1,411 agree;
// 2 differ (CLOSURE-23-DR-BACKUP-AUDIT, GAP-82-MEDICAL-CARD-TRACKING) because `--follow`'s similarity guess walked each
// spec back into the retired monolithic `.block-ready.json` (2026-05-24); the spec FILE was added 2026-06-07, which is
// what this records. `--follow` is not used: its guess is the defect.
function addDatesFromHistory() {
  const out = execFileSync(
    "git",
    ["log", "--reverse", "--diff-filter=AR", "-M", "--name-status", "--format=%x00%aI", "--", ".block-ready"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }
  );
  const dates = new Map();
  for (const chunk of out.split("\0").filter(Boolean)) {
    const lines = chunk.split(/\r?\n/).filter(Boolean);
    const d = lines[0].slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    for (const line of lines.slice(1)) {
      const [status, a, b] = line.split("\t");
      if (status === "A" && !dates.has(a)) dates.set(a, d);
      else if (status?.startsWith("R") && b && !dates.has(b)) dates.set(b, dates.get(a) ?? d);
    }
  }
  return dates;
}

function main() {
  if (!fs.existsSync(BR_DIR)) { console.error(`[created-dates] no .block-ready dir at ${BR_DIR}`); process.exit(1); }
  const dates = {};
  let dated = 0, undated = 0;
  const history = addDatesFromHistory();
  for (const f of fs.readdirSync(BR_DIR)) {
    if (!f.endsWith(".json")) continue;
    let id;
    try { id = JSON.parse(fs.readFileSync(path.join(BR_DIR, f), "utf8")).block_id ?? f.replace(/\.json$/, ""); }
    catch { id = f.replace(/\.json$/, ""); }
    const d = history.get(`.block-ready/${f}`) ?? null;
    dates[id] = d;
    if (d) dated++; else undated++;
  }
  const payload = { generated_at_iso: new Date().toISOString(), count: dated + undated, dated, undated, dates };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 1) + "\n");
  console.log(`[created-dates] wrote ${OUT} — ${dated} dated, ${undated} undated (${dated + undated} blocks)`);
}

main();
