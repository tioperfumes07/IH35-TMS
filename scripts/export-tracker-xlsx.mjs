#!/usr/bin/env node
// Multi-sheet Markdown -> XLSX exporter for the master progress tracker.
//
// docs/trackers/MASTER_PROGRESS_REPORT.md is the CANONICAL source of truth.
// This regenerates a dated Excel that MATCHES Jorge's existing v26 layout:
// one sheet per markdown "## section", with that section's real column schema,
// merged title banner, and frozen header — so it looks like the file he uses.
//
//   npm run export:tracker
//   npm run export:tracker -- --date=2026-06-14 --version=v27
//
// Reproduces 7 of the 10 v26 tabs (the markdown-backed ones):
//   00 Summary · 01 All Tasks · 04 Pending Queue · 09 Next Blocks ·
//   06 Net-New Request Types · 07 Duplicates · 08 Phase Summary
// DEFERRED (Option C, next PR — need a GitHub data pull, not in the markdown):
//   02 New Since v24 · 03 Full Merged PRs · 05 Functional Audit
//
// Uses exceljs (already a dependency) for merges + frozen panes + banner styling.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "docs/trackers/MASTER_PROGRESS_REPORT.md");
const OUT_DIR = path.join(ROOT, "docs/trackers/exports");

const NAVY = "FF1A1F36";
const HEADER_FILL = "FFE5E7EB";
const GROUP_FILL = "FFF1F2F6";

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
const allLines = md.split(/\r?\n/);
const version = arg("version", (md.match(/Reconciled,\s*(v\d+)/i) || [])[1] || "v0");
const date = arg("date", todayISO());

// ---- markdown parsing helpers ----
const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isSeparatorRow = (l) => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes("-");
function splitRow(line) {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}
const stripMd = (s) => String(s).replace(/\*\*/g, "").replace(/`/g, "").trim();

// Split markdown into { headingText -> body lines } keyed in document order.
function sectionsByHeading(lines) {
  const out = [];
  let cur = null;
  for (const l of lines) {
    const m = l.match(/^##\s+(.*)$/);
    if (m) {
      cur = { heading: m[1].trim(), lines: [] };
      out.push(cur);
    } else if (cur) {
      cur.lines.push(l);
    }
  }
  return out;
}
function findSection(sections, needle) {
  return sections.find((s) => s.heading.includes(needle));
}
// All table rows in a section (drops separator + the markdown header row).
function tableBody(sectionLines) {
  const rows = sectionLines.filter((l) => isTableRow(l) && !isSeparatorRow(l)).map(splitRow);
  return rows.length ? rows.slice(1) : []; // slice off the md header row
}
function proseLines(sectionLines) {
  return sectionLines.filter((l) => l.trim() && !isTableRow(l));
}
// A group/banner row = exactly one non-empty cell containing the ▼ marker.
function groupLabel(cells) {
  const nonEmpty = cells.filter((c) => c !== "");
  if (nonEmpty.length === 1 && /▼/.test(nonEmpty[0])) return stripMd(nonEmpty[0]);
  return null;
}

// ---- sheet config (matches v26 tab names + columns) ----
const SHEETS = [
  {
    name: "00 Summary",
    needle: "Reconciliation snapshot",
    banner: `IH35-TMS MASTER TRACKER — ${version}`,
    subtitle: `Generated ${date} from MASTER_PROGRESS_REPORT.md (markdown = source of truth)`,
    headers: ["Metric", "v24 snapshot (2026-06-08)", "LIVE now"],
    widths: [26, 30, 48],
    appendProse: true,
  },
  {
    name: "01 All Tasks",
    needle: "All Tasks — complete",
    banner: "ALL TASKS — complete sequential reconciled record",
    subtitle: `# renumbered 1..N · duplicates flagged · generated ${date}`,
    headers: ["#", "Phase / Section", "Task ID / PR", "Task Name", "Orig Status", "Reconciled Status", "Merge Date", "Merge Time", "Est Min", "Dup?", "Notes / Evidence"],
    // map markdown 9-col -> v26 11-col (Merge Time + Est Min absent in markdown)
    colMap: [0, 1, 2, 3, 4, 5, 6, null, null, 7, 8],
    widths: [6, 22, 16, 40, 12, 16, 12, 10, 8, 7, 60],
    group: true,
  },
  {
    name: "04 Pending Queue",
    needle: "Pending Queue",
    banner: "PENDING QUEUE — live ground truth",
    headers: ["#", "Item", "Section", "True Status", "Minimal summary (why pending)", "What it needs"],
    widths: [6, 24, 22, 22, 50, 50],
  },
  {
    name: "09 Next Blocks",
    needle: "Next Blocks",
    banner: "NEXT BLOCKS — recommended build order",
    subtitle: "Money-risk first → books-safety → cheap P0 → trust cleanup → features",
    headers: ["Order", "Wave", "Block / Item", "Why now", "Risk if skipped", "Effort", "Depends on", "Status today"],
    widths: [7, 6, 34, 40, 18, 8, 16, 60],
  },
  {
    name: "06 Net-New Request Types",
    needle: "Net-new driver-request",
    banner: "NET-NEW DRIVER-REQUEST TYPES",
    headers: ["Candidate", "Today", "Reuses", "Net-new needed", "GL?"],
    widths: [16, 14, 34, 40, 10],
  },
  {
    name: "07 Duplicates",
    needle: "Duplicate task clusters",
    banner: "DUPLICATE TASKS — same block, multiple rows",
    headers: ["Cluster key", "Row #s (sheet 01)", "Task name", "Note"],
    colMap: [0, 1, null, 2], // markdown: Cluster | Rows | Note  (Task name not in md)
    widths: [22, 24, 30, 34],
  },
  {
    name: "08 Phase Summary",
    needle: "Status summary",
    banner: "PHASE / STATUS SUMMARY (reconciled)",
    headers: ["Reconciled Status", "Count"],
    widths: [28, 12],
  },
];

const wb = new ExcelJS.Workbook();
wb.creator = "export-tracker-xlsx.mjs";

const sections = sectionsByHeading(allLines);

function styleBanner(ws, row, ncols, text) {
  ws.mergeCells(row, 1, row, ncols);
  const c = ws.getCell(row, 1);
  c.value = text;
  c.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  c.alignment = { vertical: "middle" };
  ws.getRow(row).height = 22;
}
function styleSub(ws, row, ncols, text) {
  ws.mergeCells(row, 1, row, ncols);
  const c = ws.getCell(row, 1);
  c.value = text;
  c.font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
}

for (const cfg of SHEETS) {
  const section = findSection(sections, cfg.needle);
  const ncols = cfg.headers.length;
  const ws = wb.addWorksheet(cfg.name);

  let r = 1;
  styleBanner(ws, r++, ncols, cfg.banner);
  if (cfg.subtitle) styleSub(ws, r++, ncols, cfg.subtitle);

  // header row (frozen below it)
  const headerRow = r;
  ws.getRow(headerRow).values = cfg.headers;
  ws.getRow(headerRow).eachCell((cell) => {
    cell.font = { bold: true, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
  });
  r++;

  const body = section ? tableBody(section.lines) : [];
  for (const cells of body) {
    const g = cfg.group ? groupLabel(cells) : null;
    if (g) {
      ws.mergeCells(r, 1, r, ncols);
      const c = ws.getCell(r, 1);
      c.value = g;
      c.font = { bold: true, size: 10, color: { argb: "FF1A1F36" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GROUP_FILL } };
      r++;
      continue;
    }
    const mapped = cfg.colMap
      ? cfg.colMap.map((idx) => (idx == null ? "" : stripMd(cells[idx] ?? "")))
      : cfg.headers.map((_, i) => stripMd(cells[i] ?? ""));
    ws.getRow(r).values = mapped;
    ws.getRow(r).alignment = { vertical: "top", wrapText: true };
    r++;
  }

  // Summary tab: append the prose facts paragraphs below the table
  if (cfg.appendProse && section) {
    r++;
    for (const p of proseLines(section.lines)) {
      ws.mergeCells(r, 1, r, ncols);
      const c = ws.getCell(r, 1);
      c.value = stripMd(p);
      c.alignment = { wrapText: true, vertical: "top" };
      c.font = { size: 9 };
      r++;
    }
  }

  ws.columns.forEach((col, i) => {
    col.width = cfg.widths[i] ?? 20;
  });
  ws.views = [{ state: "frozen", ySplit: headerRow }];
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const outFile = path.join(OUT_DIR, `IH35-TMS-MASTER-TRACKER-${date}-${version}.xlsx`);
await wb.xlsx.writeFile(outFile);

console.log(
  `[export:tracker] wrote ${path.relative(ROOT, outFile)} — ${wb.worksheets.length} sheets ` +
    `(${wb.worksheets.map((w) => w.name).join(", ")}), ${version}, ${date}`
);
console.log("[export:tracker] DEFERRED (Option C, next PR): 02 New Since v24, 03 Full Merged PRs, 05 Functional Audit (need GitHub data pull).");
