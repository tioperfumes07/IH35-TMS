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
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { execFileSync } from "node:child_process";

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

// ---- GitHub PR data (Option C tabs 02 / 03) ----
const V24_BASELINE_PR = 813; // v24 snapshot baseline (snapshot fact: "Merged since #813")
function fetchMergedPRs() {
  try {
    const raw = execFileSync(
      "gh",
      ["pr", "list", "--state", "merged", "--limit", "2000", "--json", "number,title,mergedAt,mergeCommit"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    return JSON.parse(raw)
      .map((p) => ({
        number: p.number,
        title: p.title ?? "",
        mergeDate: (p.mergedAt ?? "").slice(0, 10),
        mergeTime: (p.mergedAt ?? "").slice(11, 19),
        sha: (p.mergeCommit?.oid ?? "").slice(0, 8),
        domain: (p.title ?? "").match(/^\w+\(([^)]+)\)/)?.[1] ?? "—",
      }))
      .sort((a, b) => a.number - b.number);
  } catch {
    return null; // gh unavailable/unauthed at export time — tabs render a note instead
  }
}
const prs = fetchMergedPRs();
// Lookup #PR -> {mergeDate, mergeTime} so the 01 All Tasks rows can show real GitHub
// merge timestamps (the markdown only carries Merge Date for some rows and never Merge Time).
const prByNum = new Map((prs ?? []).map((p) => [p.number, p]));

// ---- pending-program blocks (docs/blocks/**.txt) appended to 01 All Tasks ----
const LANE_BY_PREFIX = [
  [/^HOS|^BLOCK-10/, "HOS / Telematics"], [/^UX|^TBL/, "Table / UX"], [/^DISP/, "Dispatch"],
  [/^CAP/, "Samsara CAP"], [/^MNT/, "Maintenance"], [/^INS/, "Insurance"], [/^MX/, "Mexico Ops"],
  [/^SAFE/, "Safety / PWA"], [/^RPT/, "Reports"], [/^ENT/, "Enterprise"], [/^Q9|^USMCA/, "Driver-lifecycle"],
  [/^CHAIN/, "Accounting Chain"], [/^AF-/, "AF Program"], [/^CONN/, "Connections"], [/^FH/, "Finance Hub"],
  [/^STMT/, "Statements"], [/^VOID/, "Void-Everywhere"],
];
const laneFor = (id) => (LANE_BY_PREFIX.find(([re]) => re.test(id)) || [, "Pending Program"])[1];
function loadPendingBlocks() {
  const dir = path.join(ROOT, "docs/blocks");
  if (!fs.existsSync(dir)) return [];
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const fp = path.join(d, e.name);
      if (e.isDirectory()) walk(fp);
      else if (e.name.endsWith(".txt") && !e.name.startsWith("00-")) files.push(fp);
    }
  };
  walk(dir);
  return files
    .map((fp) => {
      const lines = fs.readFileSync(fp, "utf8").split(/\r?\n/);
      const id = path.basename(fp, ".txt");
      const titleLine = (lines.find((l, i) => i > 0 && l.trim() && !/^═/.test(l)) || id).trim();
      const name = titleLine.includes(" — ") ? titleLine.split(" — ").slice(1).join(" — ") : titleLine;
      const stat = (lines.find((l) => /^(STATUS|TIER)\s*:/i.test(l)) || "").replace(/^(STATUS|TIER)\s*:\s*/i, "").trim();
      return { id, name: name.slice(0, 90), status: (stat || "BUILD").slice(0, 60), lane: laneFor(id) };
    })
    .sort((a, b) => a.lane.localeCompare(b.lane) || a.id.localeCompare(b.id));
}
const PENDING_BLOCKS = loadPendingBlocks();

// Full built/pending reconciliation (every .block-ready + program block) — written by
// scripts/reconcile-block-status. Used to put EVERY block into 01 All Tasks (none missing),
// each with a clear DONE / PENDING / PENDING (GATED) status.
function loadReconBlocks() {
  const fp = path.join(ROOT, "docs/trackers/block-reconciliation-data.json");
  if (!fs.existsSync(fp)) return [];
  try { return JSON.parse(fs.readFileSync(fp, "utf8")).blocks ?? []; } catch { return []; }
}
const RECON_BLOCKS = loadReconBlocks();
const NEW_SINCE_V24_ROWS = prs
  ? prs.filter((p) => p.number > V24_BASELINE_PR).map((p) => [`#${p.number}`, p.mergeDate, p.mergeTime, p.sha, p.domain, p.title, "merged"])
  : [["—", "—", "—", "—", "—", "GitHub data unavailable at export time (gh not authed) — re-run with gh available", "—"]];
const ALL_MERGED_ROWS = prs
  ? prs.map((p) => [`#${p.number}`, p.mergeDate, p.mergeTime, p.sha, p.title])
  : [["—", "—", "—", "—", "GitHub data unavailable at export time (gh not authed) — re-run with gh available"]];
// 05 Functional Audit has no programmatic source (hand-curated in v26); flagged for Jorge.
const FUNCTIONAL_AUDIT_ROWS = [
  ["(hand-curated v26)", "STATIC — not refreshed", "This tab is NOT regenerated by export:tracker. It was hand-curated in v26 and does not reflect live state. Define a source to auto-populate, or treat as historical only."],
];

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
    widths: [6, 22, 16, 40, 12, 16, 13, 13, 8, 7, 60],
    group: true,
  },
  {
    name: "02 New Since v24",
    banner: "NEW SINCE v24 — merged PRs (#>813)",
    subtitle: `pulled from GitHub at generate time (${date})`,
    headers: ["PR #", "Merge Date", "Merge Time", "SHA", "Domain", "Title", "Status"],
    widths: [8, 12, 11, 11, 16, 56, 10],
    rows: NEW_SINCE_V24_ROWS,
  },
  {
    name: "03 Full Merged PRs",
    banner: "FULL MERGED-PR RECORD (sorted by PR #)",
    subtitle: `pulled from GitHub at generate time (${date})`,
    headers: ["PR #", "Merge Date", "Merge Time", "SHA", "Title"],
    widths: [8, 12, 11, 11, 70],
    rows: ALL_MERGED_ROWS,
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
    name: "05 Functional Audit",
    banner: "FUNCTIONAL-COMPLETENESS AUDIT",
    subtitle: "HAND-CURATED in v26 — does NOT refresh on export; not derived from markdown/GitHub. Do not read as live.",
    headers: ["Area", "State", "Evidence / Gap"],
    widths: [26, 16, 70],
    rows: FUNCTIONAL_AUDIT_ROWS,
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
  const section = cfg.needle ? findSection(sections, cfg.needle) : null;
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

  const body = cfg.rows ?? (section ? tableBody(section.lines) : []);
  let lastNum = 0;
  const seenPRs = new Set();
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
    // 01 All Tasks: backfill Merge Date (col 7 → idx 6) + Merge Time (col 8 → idx 7) from the
    // live GitHub PR record whenever the "Task ID / PR" cell (idx 2) is a #<number>.
    if (cfg.name === "01 All Tasks") {
      const m = String(mapped[2] ?? "").trim().match(/^#(\d+)$/);
      let pr = m ? prByNum.get(Number(m[1])) : null;
      // fall back to a "PR #1234" / "#1234" reference in the Notes column (the block-labeled rows
      // like "#01-Block-W" carry their real PR number in Notes, e.g. "PR #354 merged + deployed").
      if (!pr) {
        const nm = String(mapped[10] ?? "").match(/(?:PR\s*)?#(\d+)\b/i);
        if (nm) pr = prByNum.get(Number(nm[1]));
      }
      if (pr) {
        if (!mapped[6]) mapped[6] = pr.mergeDate;
        if (!mapped[7]) mapped[7] = pr.mergeTime ? `${pr.mergeTime} UTC` : "";
      }
      const n = parseInt(String(mapped[0]).trim(), 10);
      if (Number.isFinite(n)) lastNum = Math.max(lastNum, n);
      if (m) seenPRs.add(Number(m[1]));
    }
    ws.getRow(r).values = mapped;
    ws.getRow(r).alignment = { vertical: "top", wrapText: true };
    r++;
  }

  // 01 All Tasks: bring it current to the second — append (a) every merged PR above the last one
  // already listed (the recent gap), then (b) every pending-program block from docs/blocks/.
  if (cfg.name === "01 All Tasks") {
    const groupRow = (label) => {
      ws.mergeCells(r, 1, r, ncols);
      const c = ws.getCell(r, 1);
      c.value = label;
      c.font = { bold: true, size: 10, color: { argb: "FF1A1F36" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GROUP_FILL } };
      r++;
    };
    const dataRow = (vals) => {
      ws.getRow(r).values = vals;
      ws.getRow(r).alignment = { vertical: "top", wrapText: true };
      r++;
    };
    const floor = seenPRs.size ? Math.max(...seenPRs) : 0;
    const newPrs = (prs ?? []).filter((p) => p.number > floor).sort((a, b) => a.number - b.number);
    if (newPrs.length) {
      groupRow(`▼ MERGED PRs since #${floor} — auto-appended live from GitHub (${newPrs.length}, through #${newPrs[newPrs.length - 1].number}) · ${date}`);
      for (const p of newPrs) {
        dataRow([++lastNum, p.domain, `#${p.number}`, p.title, "", "DONE", p.mergeDate, p.mergeTime ? `${p.mergeTime} UTC` : "", "", "", `merge ${p.sha}`]);
      }
    }
    // EVERY block, built vs pending (verified vs origin/main + merged PRs) — none missing.
    // Grouped PENDING → PENDING (GATED) → NEEDS-VERIFY → DONE so the open/untrusted work is at the top.
    if (RECON_BLOCKS.length) {
      const groups = [
        ["PENDING", "▼ PENDING — needs build"],
        ["PENDING (GATED)", "▼ PENDING (GATED) — financial / locked, needs Jorge's gate first"],
        ["NEEDS-VERIFY", "▼ NEEDS-VERIFY — weak signal (title-match / partial files / self-report), NOT trusted until GUARD confirms"],
        ["DONE", "▼ DONE — verified on main (branch merged OR all signature files present)"],
      ];
      for (const [st, label] of groups) {
        const rows = RECON_BLOCKS.filter((b) => b.status === st);
        if (!rows.length) continue;
        groupRow(`${label} (${rows.length}) · reconciled ${date}`);
        for (const b of rows) {
          dataRow([++lastNum, b.source, b.id, b.name, "", b.status, "", "", "", b.fin ? "FIN" : "", b.evidence]);
        }
      }
    } else if (PENDING_BLOCKS.length) {
      groupRow(`▼ PENDING PROGRAM BLOCKS — GUARD all-pending-blocks (${PENDING_BLOCKS.length}) · added ${date} · docs/blocks/`);
      for (const b of PENDING_BLOCKS) {
        dataRow([++lastNum, b.lane, b.id, b.name, "", b.status, "", "", "", "", `docs/blocks/${b.id}.txt`]);
      }
    }
    // Format Merge Date (col 7) as a REAL date (Excel sorts/filters it) and keep Merge Time (col 8)
    // in its own column. Both right-aligned so the date/time read as clean, separate columns.
    for (let rr = headerRow + 1; rr < r; rr++) {
      const dcell = ws.getCell(rr, 7);
      if (typeof dcell.value === "string") {
        const dm = dcell.value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dm) {
          dcell.value = new Date(Date.UTC(+dm[1], +dm[2] - 1, +dm[3]));
          dcell.numFmt = "yyyy-mm-dd";
        }
      }
      dcell.alignment = { vertical: "top", horizontal: "right" };
      ws.getCell(rr, 8).alignment = { vertical: "top", horizontal: "right" };
    }
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
const fileName = `IH35-TMS-MASTER-TRACKER-${date}-${version}.xlsx`;
const outFile = path.join(OUT_DIR, fileName);
await wb.xlsx.writeFile(outFile);

// Auto-deliver a copy to ~/Downloads (where Jorge opens his trackers).
let downloadsCopy = null;
try {
  const home = process.env.HOME || os.homedir();
  if (home) {
    downloadsCopy = path.join(home, "Downloads", fileName);
    fs.copyFileSync(outFile, downloadsCopy);
  }
} catch (err) {
  console.warn(`[export:tracker] could not copy to Downloads: ${err.message}`);
}

console.log(
  `[export:tracker] wrote ${path.relative(ROOT, outFile)} — ${wb.worksheets.length} sheets ` +
    `(${wb.worksheets.map((w) => w.name).join(", ")}), ${version}, ${date}`
);
if (downloadsCopy) console.log(`[export:tracker] copied to ~/Downloads/${fileName}`);
console.log(
  prs
    ? `[export:tracker] 02 New Since v24 (${NEW_SINCE_V24_ROWS.length}) + 03 Full Merged PRs (${ALL_MERGED_ROWS.length}) pulled from GitHub. 05 Functional Audit: source TBD (flagged for Jorge).`
    : "[export:tracker] WARNING: gh unavailable — 02/03 rendered a placeholder note. Re-run with gh authed to populate GitHub tabs."
);
