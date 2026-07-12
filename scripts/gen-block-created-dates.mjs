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

function addDateForFile(relPath) {
  // First commit that ADDED the file → its author date. `--follow` tracks renames; --diff-filter=A limits
  // to the add; -1 with reverse-ish semantics: git log lists newest-first, so take the LAST (oldest) add.
  try {
    const out = execFileSync(
      "git",
      ["log", "--diff-filter=A", "--follow", "--format=%aI", "--", relPath],
      { cwd: ROOT, encoding: "utf8" }
    ).split(/\r?\n/).filter(Boolean);
    const oldest = out[out.length - 1]; // oldest add commit
    if (oldest && /^\d{4}-\d{2}-\d{2}/.test(oldest)) return oldest.slice(0, 10);
  } catch { /* git unavailable / untracked file → null (undated) */ }
  return null;
}

function main() {
  if (!fs.existsSync(BR_DIR)) { console.error(`[created-dates] no .block-ready dir at ${BR_DIR}`); process.exit(1); }
  const dates = {};
  let dated = 0, undated = 0;
  for (const f of fs.readdirSync(BR_DIR)) {
    if (!f.endsWith(".json")) continue;
    let id;
    try { id = JSON.parse(fs.readFileSync(path.join(BR_DIR, f), "utf8")).block_id ?? f.replace(/\.json$/, ""); }
    catch { id = f.replace(/\.json$/, ""); }
    const d = addDateForFile(`.block-ready/${f}`);
    dates[id] = d;
    if (d) dated++; else undated++;
  }
  const payload = { generated_at_iso: new Date().toISOString(), count: dated + undated, dated, undated, dates };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 1) + "\n");
  console.log(`[created-dates] wrote ${OUT} — ${dated} dated, ${undated} undated (${dated + undated} blocks)`);
}

main();
