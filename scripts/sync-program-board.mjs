#!/usr/bin/env node
// ============================================================================
// sync-program-board.mjs — LIVE SYNC ENGINE for the Program Board
// ----------------------------------------------------------------------------
// NON-FINANCIAL (reporting/tooling only). Never touches accounting/catalogs/
// mdata/migrations. Produces the always-live data behind the Program Board.
//
//   npm run board:import   # LOCAL only — import canonical descriptive fields
//                          # from the Desktop BUG-AUDIT-FIX-TRACKER.xlsx
//   npm run board:sync     # cron/Action-safe — derive live git/deploy state
//                          # for every finding that has a PR; compute meta.
//
// Spec: docs (BOARD-LIVE-SPEC.md). See the ★ LIFECYCLE TIMELINE section:
//   requested_ct -> written_ct -> merged_ct -> deployed_ct  (4-stage lifecycle)
//
// Two modes:
//   --import-xlsx : reads Desktop xlsx with ExcelJS, matches rows to board
//                   findings by (id + fuzzy Title), writes descriptive fields.
//                   NEEDS Desktop files -> run locally, never in CI.
//   (default)     : reads git/GitHub via `gh` + prod health endpoint; derives
//                   per-row live_state + lifecycle timestamps; writes meta.
//                   NO Desktop files -> safe for a scheduled Action.
//
// Fail-loud PER FINDING: one `gh pr view` failing logs + continues; it must
// NOT abort the whole sync.
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import ExcelJS from "exceljs";
import { normalizeExcelJsCellValue } from "./exceljs-cell-value.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---- paths ----------------------------------------------------------------
const EXTRA_REL = "docs/trackers/program-board-extra.json";
const META_REL = "docs/trackers/program-board-meta.json";
const INTAKE_REL = "docs/trackers/program-board-intake.json";
const BLOCKS_REL = "docs/trackers/block-reconciliation-data.json";
const EXTRA_PATH = path.join(ROOT, EXTRA_REL);
const META_PATH = path.join(ROOT, META_REL);
const INTAKE_PATH = path.join(ROOT, INTAKE_REL);
const BLOCKS_PATH = path.join(ROOT, BLOCKS_REL);
const XLSX_AUDIT_JSON_FALLBACK = process.env.BOARD_XLSX_JSON || ""; // optional pre-extracted json

// Desktop audit xlsx (canonical descriptive columns). First existing wins.
const DESKTOP_XLSX_CANDIDATES = [
  path.join(process.env.HOME || "", "Desktop/IH35-TMS-BUG-AUDIT-FIX-TRACKER.xlsx"),
  path.join(
    process.env.HOME || "",
    "Desktop/Claude-Desktop Files-Organized/Trackers/IH35-TMS-BUG-AUDIT-FIX-TRACKER.xlsx"
  ),
];

const HEALTH_URL = "https://ih35-tms.onrender.com/api/v1/healthz/shallow";
const REPO = process.env.BOARD_REPO || "tioperfumes07/IH35-TMS";

// R2 live-snapshot key — the LIVE parts of the board (meta + per-row lifecycle) are written here on a
// schedule INSTEAD of being committed to `main`, so the board refreshes live with NO prod redeploy. The
// backend reads this FIRST and overlays it onto the committed repo JSON (fallback). Must match
// program-board.service.ts R2_LIVE_SNAPSHOT_KEY.
const R2_LIVE_SNAPSHOT_KEY = "program-board/live-snapshot.json";
// Lifecycle fields the backend overlays per row — must match program-board.service.ts LIVE_OVERLAY_FIELDS.
const LIVE_FIELDS = [
  "requested_ct",
  "written_ct",
  "merged_ct",
  "merged_at",
  "deployed_ct",
  "deploy_no",
  "pr_url",
  "live_state",
  "lifecycle",
  "synced_at",
];

// ---- small utils ----------------------------------------------------------
const CT_TZ = "America/Chicago";
const readJSON = (p, dflt = null) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return dflt;
  }
};
// Preserve each target file's existing indentation (block-reconciliation-data.json
// is generated with 1-space indent; program-board-*.json with 2) so enrichment
// produces a minimal, review-friendly diff instead of a whole-file reformat.
function detectIndent(p) {
  try {
    const m = fs.readFileSync(p, "utf8").match(/\n([\t ]+)"/);
    if (m) return m[1][0] === "\t" ? "\t" : m[1].length;
  } catch {
    /* new file */
  }
  return 2;
}
const writeJSON = (p, obj, indent) =>
  fs.writeFileSync(p, JSON.stringify(obj, null, indent == null ? detectIndent(p) : indent) + "\n");

// Convert an ISO timestamp -> "YYYY-MM-DD HH:MM CT" in America/Chicago.
function toCT(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t) => parts.find((x) => x.type === t)?.value;
  let hh = g("hour");
  if (hh === "24") hh = "00";
  return `${g("year")}-${g("month")}-${g("day")} ${hh}:${g("minute")} CT`;
}
const nowISO = () => new Date().toISOString();
const nowCT = () => toCT(nowISO());

// PR number extractor: board `pr` may be a number (2017) or "#2106" or "merged #1881".
function prNumber(pr) {
  if (pr == null) return null;
  if (typeof pr === "number") return pr;
  const m = String(pr).match(/#?\s*(\d{2,7})/);
  return m ? Number(m[1]) : null;
}

// ---- fuzzy title matching (import mode) -----------------------------------
const STOP = new Set([
  "the", "a", "an", "of", "to", "and", "or", "in", "on", "is", "are", "for",
  "with", "no", "not", "any", "all", "via", "per", "by", "at",
]);
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[—–‒-]/g, " ") // em/en dashes -> space
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function tokens(s) {
  return norm(s)
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}
// Score a candidate board name vs an xlsx title: normalized-substring bonus +
// token-overlap (Jaccard-ish). Higher is better.
function titleScore(boardName, xlsxTitle) {
  const nb = norm(boardName);
  const nx = norm(xlsxTitle);
  if (!nb || !nx) return 0;
  let score = 0;
  if (nb.includes(nx) || nx.includes(nb)) score += 1.0; // board name CONTAINS title (common case)
  const tb = new Set(tokens(boardName));
  const tx = tokens(xlsxTitle);
  if (tx.length) {
    let hit = 0;
    for (const t of tx) if (tb.has(t)) hit++;
    const denom = new Set([...tb, ...tx]).size || 1;
    score += hit / denom; // Jaccard overlap
    score += 0.25 * (hit / tx.length); // recall of the xlsx title's tokens
  }
  return score;
}

// ============================================================================
// MODE 1: --import-xlsx
// ============================================================================
async function loadXlsxRowsAsync() {
  const desktop = DESKTOP_XLSX_CANDIDATES.find((p) => p && fs.existsSync(p));
  if (desktop) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(desktop);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return { rows: [], source: desktop };
    const headers = [];
    worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
      const value = normalizeExcelJsCellValue(cell.value);
      headers[column - 1] = value == null ? "" : String(value);
    });
    const rows = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const record = {};
      headers.forEach((header, index) => {
        if (!header) return;
        const cellValue = row.getCell(index + 1).value;
        record[header] = cellValue == null ? "" : normalizeExcelJsCellValue(cellValue);
      });
      rows.push(record);
    });
    return { rows, source: desktop };
  }
  if (XLSX_AUDIT_JSON_FALLBACK && fs.existsSync(XLSX_AUDIT_JSON_FALLBACK)) {
    return { rows: readJSON(XLSX_AUDIT_JSON_FALLBACK, []), source: XLSX_AUDIT_JSON_FALLBACK };
  }
  return { rows: null, source: null };
}

const s = (v) => {
  const t = String(v == null ? "" : v).trim();
  return t.length ? t : undefined;
};

async function runImport() {
  const extra = readJSON(EXTRA_PATH);
  if (!extra || !Array.isArray(extra.audit_bug_sweep)) {
    console.error(`[import] cannot read ${EXTRA_REL} audit_bug_sweep[]`);
    process.exit(1);
  }
  const { rows, source } = await loadXlsxRowsAsync();
  if (!rows) {
    console.error(
      "[import] No Desktop xlsx found and no BOARD_XLSX_JSON fallback set. Candidates:\n  " +
        DESKTOP_XLSX_CANDIDATES.join("\n  ")
    );
    process.exit(1);
  }
  console.log(`[import] xlsx source: ${source} (${rows.length} rows)`);

  const board = extra.audit_bug_sweep;
  // Group xlsx rows by ID; match board rows within each id via best title score.
  const xById = new Map();
  for (const r of rows) {
    const id = s(r.ID) || s(r.id) || "";
    if (!xById.has(id)) xById.set(id, []);
    xById.get(id).push(r);
  }
  const bById = new Map();
  board.forEach((b, idx) => {
    const id = b.id || "";
    if (!bById.has(id)) bById.set(id, []);
    bById.get(id).push({ b, idx });
  });

  let matched = 0;
  const unmatched = [];
  const applyFields = (b, x) => {
    const set = (k, v) => {
      if (v !== undefined) b[k] = v;
    };
    set("severity", s(x.Severity));
    set("lane", s(x.Lane));
    set("module", s(x.Module));
    set("where", s(x["Where (file:line)"]));
    set("guard", s(x.Guard));
    set("root_cause", s(x["Root cause"]));
    set("impact", s(x.Impact));
    // NOTE: intentionally NOT touching status/pr/done_ct — owned by live sync + trueup.
  };

  for (const [id, bItems] of bById) {
    const xItems = (xById.get(id) || []).slice();
    // Greedy best-match: rank all (board,xlsx) pairs by score, assign top-down.
    const pairs = [];
    for (const bi of bItems) {
      for (let xi = 0; xi < xItems.length; xi++) {
        pairs.push({ bi, xi, score: titleScore(bi.b.name, xItems[xi].Title) });
      }
    }
    pairs.sort((a, c) => c.score - a.score);
    const usedB = new Set();
    const usedX = new Set();
    for (const p of pairs) {
      if (usedB.has(p.bi.idx) || usedX.has(p.xi)) continue;
      if (p.score <= 0) continue;
      applyFields(p.bi.b, xItems[p.xi]);
      usedB.add(p.bi.idx);
      usedX.add(p.xi);
      matched++;
    }
    // Any board rows for this id left unmatched:
    for (const bi of bItems) {
      if (!usedB.has(bi.idx)) {
        // Single-candidate id? still apply (score 0 only when both empty) — else report.
        if (xItems.length === 1 && bItems.length === 1) {
          applyFields(bi.b, xItems[0]);
          matched++;
        } else {
          unmatched.push({ id, name: bi.b.name });
        }
      }
    }
  }

  const total = board.length;
  const rate = ((matched / total) * 100).toFixed(1);
  console.log(`\n[import] MATCH RATE: ${matched}/${total} (${rate}%)`);
  if (unmatched.length) {
    console.log(`[import] UNMATCHED (${unmatched.length}):`);
    for (const u of unmatched) console.log(`  - ${u.id} :: ${String(u.name).slice(0, 80)}`);
  } else {
    console.log("[import] UNMATCHED: none");
  }

  extra.audit_xlsx_import = {
    at: nowISO(),
    source: path.basename(source),
    matched,
    total,
    rate_pct: Number(rate),
  };
  writeJSON(EXTRA_PATH, extra);
  console.log(`[import] wrote descriptive fields -> ${EXTRA_REL}`);
}

// ============================================================================
// MODE 2: default live sync (git/deploy lifecycle + totals/deltas)
// ============================================================================
function ghPrView(n) {
  // Returns parsed JSON or throws. Fail-loud handled by caller (per-finding).
  const out = execFileSync(
    "gh",
    [
      "pr",
      "view",
      String(n),
      "--repo",
      REPO,
      "--json",
      "state,createdAt,mergedAt,mergeCommit,statusCheckRollup,url,number",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  return JSON.parse(out);
}

async function fetchDeployVersion() {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    return { version: j.version || null, at: nowISO() };
  } catch (e) {
    console.warn(`[sync] health fetch failed (${e.message}) — deployed detection skipped this run`);
    return { version: null, at: nowISO() };
  }
}

// Derive live_state from a gh PR payload (+ the finding's gated flag).
function deriveLiveState(pr, gated) {
  if (!pr) return gated ? "gated" : "pending";
  if (pr.state === "MERGED") return "merged"; // upgraded to "deployed" later
  if (pr.state === "CLOSED") return gated ? "gated" : "pending"; // closed-unmerged => not shipped
  // OPEN:
  const roll = pr.statusCheckRollup || [];
  let anyRunning = false;
  let anyFail = false;
  for (const c of roll) {
    // CheckRun: status/conclusion ; StatusContext: state
    const status = c.status; // QUEUED/IN_PROGRESS/COMPLETED
    const concl = c.conclusion; // SUCCESS/FAILURE/NEUTRAL/CANCELLED/SKIPPED/TIMED_OUT/ACTION_REQUIRED
    const state = c.state; // for StatusContext: SUCCESS/PENDING/FAILURE/ERROR
    if (status && status !== "COMPLETED") anyRunning = true;
    if (state === "PENDING" || state === "EXPECTED") anyRunning = true;
    if (concl && ["FAILURE", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes(concl))
      anyFail = true;
    if (state === "FAILURE" || state === "ERROR") anyFail = true;
  }
  if (anyFail) return "ci-failed";
  if (anyRunning) return "in-ci";
  return "waiting-merge"; // open, all green/neutral
}

const shortSha = (sha) => (sha ? String(sha).slice(0, 7) : null);

// Heuristic for "deployed": a merged PR is considered live once the prod health
// `version` advances to (or past) its merge. We can't compute git-ancestry here
// without the full history, so we approximate: if the PR's merge short-sha ==
// the live version -> deployed now; OR if the PR merged and there IS a live
// deploy whose detection time is at/after the merge -> deployed. Once detected,
// deployed_ct is PERSISTED (earliest detection) so it never resets.
function computeDeployed({ pr, liveVersion, priorDeployedCt, priorDeployNo }) {
  if (!pr || pr.state !== "MERGED" || !pr.mergedAt) {
    return { deployedCt: priorDeployedCt || null, deployNo: priorDeployNo || null, deployed: false };
  }
  // Already detected before -> keep earliest.
  if (priorDeployedCt) {
    return {
      deployedCt: priorDeployedCt,
      deployNo: priorDeployNo || shortSha(pr.mergeCommit?.oid),
      deployed: true,
    };
  }
  const mergeSha = shortSha(pr.mergeCommit?.oid);
  const mergedMs = new Date(pr.mergedAt).getTime();
  const liveIsExact = liveVersion && mergeSha && liveVersion.startsWith(mergeSha);
  // "live advanced past merge": prod has a version AND this PR merged before now.
  // (Health has no deploy timestamp; we treat presence of a live version + the
  //  PR being merged in the past as evidence the fix rolled forward. This is the
  //  documented approximation — exact ancestry needs git, unavailable in-Action.)
  const liveAdvanced = !!liveVersion && mergedMs <= Date.now();
  if (liveIsExact || liveAdvanced) {
    return { deployedCt: nowCT(), deployNo: mergeSha || liveVersion, deployed: true };
  }
  return { deployedCt: null, deployNo: null, deployed: false };
}

function lifecycleOf({ requestedCt, writtenCt, mergedCt, deployedCt }) {
  if (deployedCt) return "deployed";
  if (mergedCt) return "merged";
  if (writtenCt) return "written";
  if (requestedCt) return "requested";
  return "requested";
}

// Seed the intake file if missing (Jorge's two pasted work orders @ ~17:20 CT).
function ensureIntake() {
  let intake = readJSON(INTAKE_PATH);
  if (intake && typeof intake === "object") return intake;
  intake = {
    "_comment":
      "Intake timestamps (requested_ct): id-or-block -> ISO ts, stamped when Jorge pastes/uploads a work order. Falls back to a finding's registered_on when absent.",
    "RATECON-4": "2026-07-05T17:20:00Z",
    "RATECON-5": "2026-07-05T17:20:00Z",
  };
  writeJSON(INTAKE_PATH, intake);
  console.log(`[sync] seeded ${INTAKE_REL} (RATECON-4/5 @ 2026-07-05T17:20:00Z)`);
  return intake;
}

function requestedCtFor(row, intake) {
  // intake keyed by id (or a block token in notes). Fall back to registered_on.
  const byId = intake[row.id];
  if (byId) return toCT(byId);
  if (row.registered_on) {
    // registered_on is a date "YYYY-MM-DD" -> treat as local CT midnight display
    return toCT(`${row.registered_on}T00:00:00-06:00`) || `${row.registered_on} 00:00 CT`;
  }
  return null;
}

const prUrlFor = (n) => (n ? `https://github.com/${REPO}/pull/${n}` : null);

// live_state for a row with NO PR (block rows built by evidence, or unbuilt).
function statusLiveState(row, gated) {
  if (/^DONE/i.test(row.status || "")) return "merged"; // done-by-evidence -> counts as done
  if (gated) return "gated";
  return "pending";
}

// SHARED per-row lifecycle enrichment — used by BOTH audit findings and
// block/task rows so a single row shows: requested -> written -> merged ->
// deployed. Additive: writes only lifecycle fields, never status/financial fields.
// Returns the derived live_state.
function enrichRow({ row, track, gated, intake, deploy, getPr, ghOk, prior, priorLc, nowStamp, completedNow, mergedPrMap }) {
  const n = prNumber(row.pr);
  const requested_ct = requestedCtFor(row, intake);

  // No PR at all -> status-derived state (still stamp lifecycle fields; additive).
  if (!n) {
    const live_state = statusLiveState(row, gated);
    row.requested_ct = requested_ct || prior.requested_ct || null;
    row.written_ct = null;
    row.merged_ct = null;
    row.merged_at = null;
    row.deployed_ct = null;
    row.deploy_no = null;
    row.pr_url = null;
    row.live_state = live_state;
    row.lifecycle = live_state === "merged" ? "merged" : "requested";
    row.synced_at = nowStamp;
    return live_state;
  }

  // Terminal fast-path: already fully enriched + deployed -> reuse prior, skip gh
  // (bounds steady-state gh calls; deployed is terminal so nothing changes).
  const terminal = prior.lifecycle === "deployed" && prior.written_ct && prior.deployed_ct;

  let pr = null;
  if (ghOk && !terminal) pr = getPr(n);

  // Preserve-prior path (terminal, OR gh down but we have a prior snapshot).
  if (terminal || (!ghOk && prior.live_state)) {
    row.requested_ct = requested_ct || prior.requested_ct || null;
    row.written_ct = prior.written_ct || null;
    row.merged_ct = prior.merged_ct || null;
    row.merged_at = prior.merged_at || null;
    row.deployed_ct = prior.deployed_ct || null;
    row.deploy_no = prior.deploy_no || null;
    row.pr_url = prior.pr_url || prUrlFor(n);
    row.live_state = prior.live_state || (prior.deployed_ct ? "deployed" : "merged");
    row.lifecycle =
      prior.lifecycle ||
      lifecycleOf({ requestedCt: row.requested_ct, writtenCt: row.written_ct, mergedCt: row.merged_ct, deployedCt: row.deployed_ct });
    row.synced_at = nowStamp;
    return row.live_state;
  }

  let written_ct = pr?.createdAt ? toCT(pr.createdAt) : prior.written_ct || null;
  let merged_ct = pr?.mergedAt ? toCT(pr.mergedAt) : prior.merged_ct || null;
  let merged_at = pr?.mergedAt || prior.merged_at || null;

  // Local merged_prs fallback (Action-safe, no network) for the merge timestamp
  // when gh is unavailable/rate-limited or didn't resolve it.
  if (!merged_at && mergedPrMap && mergedPrMap.has(n)) {
    merged_at = mergedPrMap.get(n);
    merged_ct = toCT(merged_at);
  }

  // Build a pr-like object for state/deploy derivation when gh gave nothing but
  // we know from merged_prs that it merged.
  let prForState = pr;
  if (!prForState && merged_at) {
    prForState = { state: "MERGED", mergedAt: merged_at, mergeCommit: null, url: null, createdAt: null };
  }

  const pr_url = pr?.url || prior.pr_url || prUrlFor(n);
  let live_state = deriveLiveState(prForState, gated);
  const dep = computeDeployed({
    pr: prForState,
    liveVersion: deploy.version,
    priorDeployedCt: prior.deployed_ct,
    priorDeployNo: prior.deploy_no,
  });
  if (dep.deployed) live_state = "deployed";

  const lifecycle = lifecycleOf({
    requestedCt: requested_ct,
    writtenCt: written_ct,
    mergedCt: merged_ct,
    deployedCt: dep.deployedCt,
  });

  if ((lifecycle === "deployed" || lifecycle === "merged") && priorLc !== "deployed" && priorLc !== "merged") {
    completedNow.push({ track, id: row.id, name: row.name, pr: `#${n}`, at: merged_ct || nowCT() });
  }

  row.requested_ct = requested_ct || null;
  row.written_ct = written_ct;
  row.merged_ct = merged_ct;
  row.merged_at = merged_at;
  row.deployed_ct = dep.deployedCt;
  row.deploy_no = dep.deployNo;
  row.pr_url = pr_url;
  row.live_state = live_state;
  row.lifecycle = lifecycle;
  row.synced_at = nowStamp;
  return live_state;
}

// Tally live_state values -> the standard tab shape.
function tallyLiveStates(rows) {
  const t = { total: rows.length, done: 0, open: 0, gated: 0, waiting_merge: 0, in_ci: 0, ci_failed: 0, pending: 0, deployed: 0, merged: 0 };
  for (const r of rows) {
    switch (r.live_state) {
      case "deployed": t.deployed++; t.done++; break;
      case "merged": t.merged++; t.done++; break;
      case "waiting-merge": t.waiting_merge++; break;
      case "in-ci": t.in_ci++; break;
      case "ci-failed": t.ci_failed++; break;
      case "gated": t.gated++; break;
      default: t.pending++; break;
    }
  }
  t.open = t.total - t.done;
  return t;
}

// ---- module/section derivation --------------------------------------------
// Audit row module: leading parenthetical of the name, first token before "/".
//   "1 (Security/Identity) — ..."     -> "Security"
//   "C1 (Dispatch/Compliance) — ..."  -> "Dispatch"
function moduleOfAudit(row) {
  if (row.module) return String(row.module).split("/")[0].trim();
  const m = String(row.name || "").match(/\(([^)]+)\)/);
  if (m) {
    const first = m[1].split("/")[0].trim();
    if (first) return first;
  }
  return "Other";
}
// Block row phase/section: the leading id segment (phase token).
//   "A1-AUDIT-SPINE-LINK-COLUMNS" -> "A1" ; "RECON-01" -> "RECON" ; "P3-T11.17" -> "P3"
function moduleOfBlock(row) {
  const id = String(row.id || "").trim();
  if (!id) return "Other";
  const seg = id.split(/[-_.]/)[0];
  return seg || "Other";
}

const isDoneState = (r) => r.live_state === "deployed" || r.live_state === "merged";

// Extend a plain live-state tally with the richer real-time metrics the owner
// asked for: financial_pending, by_module, pct_deployed, pct_done.
function extendedTab(rows, moduleOf) {
  const base = tallyLiveStates(rows);
  const financial_pending = rows.filter((r) => r.fin === true && !isDoneState(r)).length;
  const by_module = {};
  for (const r of rows) {
    const m = moduleOf(r) || "Other";
    const b = by_module[m] || (by_module[m] = { total: 0, done: 0, pending: 0, financial_pending: 0 });
    b.total++;
    if (isDoneState(r)) b.done++;
    else {
      b.pending++;
      if (r.fin === true) b.financial_pending++;
    }
  }
  return {
    ...base,
    financial_pending,
    pct_deployed: base.total ? Number((base.deployed / base.total).toFixed(4)) : 0,
    pct_done: base.total ? Number((base.done / base.total).toFixed(4)) : 0,
    by_module,
  };
}

// ---- R2 live-snapshot output (no repo commit, no redeploy) -----------------
// Build the LIVE snapshot the backend overlays: whole meta + a per-row map of ONLY the lifecycle fields,
// keyed `${track}::${id}::${name}` (same key the backend rebuilds). The canonical finding LIST +
// descriptive fields stay in the committed JSON — we never ship them here.
function buildLiveSnapshot(extra, blockRows, meta) {
  const pick = (row) => {
    const o = {};
    for (const k of LIVE_FIELDS) if (row[k] !== undefined) o[k] = row[k];
    return o;
  };
  const live = {};
  for (const r of extra.audit_bug_sweep || []) live[`audit::${r.id}::${r.name}`] = pick(r);
  for (const r of blockRows) live[`block::${r.id}::${r.name}`] = pick(r);
  return { generated_at_iso: nowISO(), meta, live };
}

// Upload the snapshot to R2 using the same @aws-sdk/client-s3 + Cloudflare endpoint the backend uses.
// Missing R2 creds → warn + skip (exit 0): the board simply keeps serving the committed fallback until
// the owner sets the R2_* secrets. Returns true on a real upload.
async function uploadSnapshotToR2(snapshot) {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET || "ih35-tms-evidence";
  if (!accountId || !accessKeyId || !secretAccessKey) {
    const missing = [
      !accountId && "R2_ACCOUNT_ID",
      !accessKeyId && "R2_ACCESS_KEY_ID",
      !secretAccessKey && "R2_SECRET_ACCESS_KEY",
    ].filter(Boolean);
    console.warn(
      `[sync] --to-r2: R2 not configured (missing ${missing.join(", ")}) — SKIPPING upload. ` +
        `The board keeps serving the committed JSON fallback until these secrets are set.`
    );
    return false;
  }
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  const body = Buffer.from(JSON.stringify(snapshot));
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: R2_LIVE_SNAPSHOT_KEY,
      Body: body,
      ContentType: "application/json",
    })
  );
  console.log(
    `[sync] --to-r2: uploaded live snapshot -> r2://${bucket}/${R2_LIVE_SNAPSHOT_KEY} ` +
      `(${body.length} bytes, ${Object.keys(snapshot.live || {}).length} rows). No repo commit, no redeploy.`
  );
  return true;
}

async function runSync({ toR2 = false } = {}) {
  const extra = readJSON(EXTRA_PATH);
  if (!extra || !Array.isArray(extra.audit_bug_sweep)) {
    console.error(`[sync] cannot read ${EXTRA_REL} audit_bug_sweep[]`);
    process.exit(1);
  }
  // Block/task rows live in a SEPARATE tracker (rendered by All Tasks / Currently
  // Pending). Absence is tolerated — block tabs are simply omitted, never a 500.
  const blockData = readJSON(BLOCKS_PATH);
  const blockRows = blockData && Array.isArray(blockData.blocks) ? blockData.blocks : [];
  if (!blockRows.length) console.warn(`[sync] ${BLOCKS_REL} has no blocks[] — block tabs skipped`);
  // Local merged-PR map (number -> mergedAt): Action-safe fallback, no network.
  const mergedPrMap = new Map();
  for (const p of blockData?.merged_prs || []) {
    if (p && p.number != null && p.mergedAt) mergedPrMap.set(Number(p.number), p.mergedAt);
  }

  const priorMeta = readJSON(META_PATH) || {};
  // Prior snapshots (for persisted deployed_ct + delta diffing), keyed by track.
  const priorRowByKey = new Map();
  for (const r of extra.audit_bug_sweep) priorRowByKey.set(`audit::${r.id}::${r.name}`, r);
  for (const r of blockRows) priorRowByKey.set(`block::${r.id}::${r.name}`, r);

  const intake = ensureIntake();
  const deploy = await fetchDeployVersion();
  console.log(`[sync] live deploy version: ${deploy.version || "(unknown)"}`);

  // gh availability check (fail-loud but graceful):
  let ghOk = true;
  try {
    execFileSync("gh", ["auth", "status"], { stdio: ["ignore", "ignore", "ignore"] });
  } catch {
    ghOk = false;
    console.warn("[sync] `gh` not authenticated — using local merged_prs fallback for merge times.");
  }

  const prCache = new Map();
  const getPr = (n) => {
    if (prCache.has(n)) return prCache.get(n);
    let val = null;
    try {
      val = ghPrView(n);
    } catch (e) {
      console.warn(`[sync] gh pr view #${n} FAILED (${String(e.message).split("\n")[0]}) — continuing`);
      val = null;
    }
    prCache.set(n, val);
    return val;
  };

  const nowStamp = nowISO();
  const completedNow = [];
  const added = [];
  const priorIndex = priorMeta._row_index || null;

  const processTrack = (rows, track, moduleOf) => {
    for (const row of rows) {
      const gated = /GATED/i.test(row.status || "") || row.tier === "STOP" || row.fin === true;
      const prior = priorRowByKey.get(`${track}::${row.id}::${row.name}`) || {};
      const priorLc = prior.lifecycle || null;
      enrichRow({ row, track, gated, intake, deploy, getPr, ghOk, prior, priorLc, nowStamp, completedNow, mergedPrMap });
      // added-since-prior diff (only when we have a prior index to compare against)
      if (priorIndex) {
        const key = `${track}::${row.id}::${row.name}`;
        if (!(key in priorIndex)) added.push({ track, id: row.id, name: row.name, at: row.requested_ct || nowCT() });
      }
    }
  };

  processTrack(extra.audit_bug_sweep, "audit", moduleOfAudit);
  processTrack(blockRows, "block", moduleOfBlock);

  // ---- per-tab tallies ------------------------------------------------------
  const audit = extra.audit_bug_sweep;
  const pendingBlocks = blockRows.filter((r) => !isDoneState(r)); // "Currently Pending" tab
  const auditTab = extendedTab(audit, moduleOfAudit);
  const allTab = extendedTab(blockRows, moduleOfBlock);
  const pendingTab = extendedTab(pendingBlocks, moduleOfBlock);

  // deltas per track (recent = counts since prior snapshot)
  const auditAdded = added.filter((a) => a.track === "audit").length;
  const auditCompleted = completedNow.filter((c) => c.track === "audit").length;
  const blockAdded = added.filter((a) => a.track === "block").length;
  const blockCompleted = completedNow.filter((c) => c.track === "block").length;
  auditTab.added_recent = auditAdded;
  auditTab.completed_recent = auditCompleted;
  allTab.added_recent = blockAdded;
  allTab.completed_recent = blockCompleted;
  pendingTab.added_recent = blockAdded;
  pendingTab.completed_recent = blockCompleted;

  // Secondary tabs unchanged (owner/dispatch/merged from extra tracks).
  const tabTotals = (arr, doneMatch) => {
    const list = Array.isArray(arr) ? arr : [];
    const done = list.filter((r) => doneMatch(r)).length;
    return { total: list.length, done, open: list.length - done };
  };
  const isDoneStatus = (r) => /^DONE/i.test(r.status || "");

  const financialPendingAll = auditTab.financial_pending + allTab.financial_pending;

  const meta = {
    last_synced_ct: nowCT(),
    last_synced_at: nowStamp,
    deploy_version: deploy.version || null,
    deploy_checked_at: deploy.at,
    gh_authenticated: ghOk,
    totals: {
      blocks_total: allTab.total,
      blocks_done: allTab.done,
      blocks_pending: allTab.open,
      financial_pending: financialPendingAll,
      added_since_last: added.length,
      completed_since_last: completedNow.length,
      deploy_version: deploy.version || null,
      last_synced_ct: nowCT(),
    },
    tabs: {
      audit: auditTab,
      all: allTab,
      pending: pendingTab,
      merged: tabTotals(audit.filter(isDoneStatus), () => true),
      owner: tabTotals(extra.owner_batch, isDoneStatus),
      dispatch: tabTotals(extra.dispatch_kit, isDoneStatus),
    },
    deltas: {
      since: priorMeta.last_synced_ct || null,
      added,
      completed: completedNow,
    },
    // internal index used to compute `added` on the NEXT run (not for FE display).
    _row_index: {
      ...Object.fromEntries(audit.map((r) => [`audit::${r.id}::${r.name}`, r.live_state])),
      ...Object.fromEntries(blockRows.map((r) => [`block::${r.id}::${r.name}`, r.live_state])),
    },
  };

  if (toR2) {
    // LIVE-to-R2 mode: NO local repo writes → NO commit → NO prod redeploy. The board reads this snapshot
    // first and overlays it onto the committed JSON. This is the scheduled refresh path.
    const snapshot = buildLiveSnapshot(extra, blockRows, meta);
    await uploadSnapshotToR2(snapshot);
    console.log("[sync] --to-r2 mode: skipped local repo writes (no commit, no redeploy).");
  } else {
    // LOCAL mode: write the committed JSON in place (used locally / when refreshing the baked fallback).
    writeJSON(EXTRA_PATH, extra);
    if (blockData) writeJSON(BLOCKS_PATH, blockData);
    writeJSON(META_PATH, meta);
    console.log(`[sync] wrote ${EXTRA_REL} + ${BLOCKS_REL} + ${META_REL}`);
  }

  console.log("\n[sync] meta.tabs.audit:", JSON.stringify({ total: auditTab.total, done: auditTab.done, deployed: auditTab.deployed, gated: auditTab.gated, pending: auditTab.pending, financial_pending: auditTab.financial_pending }));
  console.log("[sync] meta.tabs.all:", JSON.stringify({ total: allTab.total, done: allTab.done, open: allTab.open, gated: allTab.gated, waiting_merge: allTab.waiting_merge, in_ci: allTab.in_ci, pending: allTab.pending, financial_pending: allTab.financial_pending }));
  console.log("[sync] meta.tabs.pending:", JSON.stringify({ total: pendingTab.total, gated: pendingTab.gated, pending: pendingTab.pending, financial_pending: pendingTab.financial_pending }));
  console.log("[sync] meta.totals:", JSON.stringify(meta.totals));
  console.log(`[sync] deltas: +${added.length} added, ${completedNow.length} completed (since ${meta.deltas.since || "n/a"})`);
  const blkEnriched = blockRows.filter((r) => r.live_state).length;
  console.log(`[sync] enriched: ${audit.length} audit rows + ${blkEnriched} block rows (${blockRows.filter((r) => prNumber(r.pr)).length} with a PR)`);
}

// ============================================================================
// entry
// ============================================================================
const mode = process.argv.includes("--import-xlsx") ? "import" : "sync";
const toR2 = process.argv.includes("--to-r2"); // write LIVE snapshot to R2 instead of committing repo JSON
(async () => {
  if (mode === "import") await runImport();
  else await runSync({ toR2 });
})().catch((e) => {
  console.error("[fatal]", e);
  process.exit(1);
});
