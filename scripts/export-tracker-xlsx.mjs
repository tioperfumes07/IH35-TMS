#!/usr/bin/env node
// Faithful Markdown -> XLSX exporter for the master progress tracker.
//
// docs/trackers/MASTER_PROGRESS_REPORT.md is the CANONICAL source of truth.
// This script regenerates a dated Excel VIEW of it so the two never drift:
//   docs/trackers/exports/IH35-TMS-MASTER-TRACKER-<date>-<version>.xlsx
//
// Re-runnable — one command regenerates the current Excel from whatever the
// markdown says:
//   npm run export:tracker                       (date = today, version from md title)
//   npm run export:tracker -- --date=2026-06-14 --version=v27   (overrides)
//
// Uses the `xlsx` package already in package.json (no new dependency).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "docs/trackers/MASTER_PROGRESS_REPORT.md");
const OUT_DIR = path.join(ROOT, "docs/trackers/exports");

function arg(name, def) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : def;
}

function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const md = fs.readFileSync(SRC, "utf8");
const lines = md.split(/\r?\n/);

// Version comes from the markdown title "(Reconciled, vNN)" unless overridden,
// so the markdown stays the single source of the version number.
const versionFromTitle = (md.match(/Reconciled,\s*(v\d+)/i) || [])[1] || "v0";
const version = arg("version", versionFromTitle);
const date = arg("date", todayISO());

const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isSeparatorRow = (l) => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes("-");

// Split a markdown table row on UNESCAPED pipes, then unescape "\|" -> "|".
function splitRow(line) {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

const aoa = [];
aoa.push([`IH35-TMS Master Progress Tracker — ${version} — generated ${date}`]);
aoa.push([
  "Source of truth: docs/trackers/MASTER_PROGRESS_REPORT.md (markdown). This .xlsx is a generated view — regenerate: npm run export:tracker",
]);
aoa.push([]);

let maxCols = 1;
let prevBlank = false;
for (const l of lines) {
  if (l.trim() === "") {
    if (!prevBlank) aoa.push([]); // collapse runs of blank lines to one spacer
    prevBlank = true;
    continue;
  }
  prevBlank = false;
  if (isTableRow(l)) {
    if (isSeparatorRow(l)) continue; // drop the |---|---| divider
    const cells = splitRow(l);
    maxCols = Math.max(maxCols, cells.length);
    aoa.push(cells);
  } else if (/^#{1,6}\s/.test(l)) {
    aoa.push([l.replace(/^#{1,6}\s/, "").trim()]); // heading -> section row
  } else {
    aoa.push([l.replace(/^\s*[-*]\s/, "• ").trim()]); // prose/bullet -> single cell
  }
}

const ws = XLSX.utils.aoa_to_sheet(aoa);
ws["!cols"] = Array.from({ length: Math.max(maxCols, 6) }, (_, i) => ({
  wch: i === 0 ? 18 : i < 4 ? 24 : 44,
}));

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Master Tracker");

fs.mkdirSync(OUT_DIR, { recursive: true });
const outFile = path.join(OUT_DIR, `IH35-TMS-MASTER-TRACKER-${date}-${version}.xlsx`);
XLSX.writeFile(wb, outFile);

console.log(
  `[export:tracker] wrote ${path.relative(ROOT, outFile)} — ${aoa.length} rows, ${maxCols} cols, ${version}, ${date}`
);
