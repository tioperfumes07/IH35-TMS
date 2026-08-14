#!/usr/bin/env node
/**
 * verify-matrix-built-leaf-specific — LINK-THEATER-01.
 *
 * ROOT CAUSE: a Box-3-Built claim (`@matrix-built` tag or a docs/specs/scoreboard/wire-sprint-built.json
 * entry) whose `leafRe` trivially matches every leaf id (".*", "^.*$", ".+", "^.+$", or "") credits an
 * ENTIRE column as Built for EVERY leaf in EVERY listed module off one PR — the exact "leafRe=.*
 * theater" the FULLY-WIRED-COMPLETE-BAR law (item 6) and the wave-queue vertical method forbid.
 *
 * This used to be checked ONLY for the reverse_link column (verify-reverse-link-built-tags-strict.mjs).
 * Measured live 2026-08-13: the identical shape existed UNGUARDED for ap_bill, load, trailer, unit,
 * vendor, customer, driver, and connectivity — 8 wire-sprint-built.json entries plus 18 `@matrix-built`
 * script tags, each claiming Built across dozens of modules from a ~9-file "representative contract"
 * spot check (see scripts/verify-wave-a-driver-all-modules.mjs) rather than real per-leaf proof.
 *
 * FIX: reject a match-all leafRe for ANY column, from EITHER source. The runtime scoreboard
 * (apps/backend/src/program/matrix-built-auto.ts — isLeafSpecific()) already stopped crediting these
 * live; this guard makes the regression impossible to reintroduce, in CI, without a live app.
 *
 * isLeafSpecific() here MUST stay in sync with the copy in matrix-built-auto.ts (plain guard scripts
 * run standalone via `node`, not through the TS build, so it cannot import the .ts source directly —
 * same duplicate-in-lockstep pattern as classifyCell()/classCellFor() elsewhere in this codebase).
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-matrix-built-leaf-specific";
const FEED_FILE = "docs/specs/scoreboard/wire-sprint-built.json";
/** LEGACY-BROAD-BASELINE-2026-08-13: the count discovered the moment this guard was written, mirroring
 * verify-matrix-built-tag-present.mjs's own new-vs-legacy ratchet (that guard already hard-fails only
 * branch-touched files and WARNs on the pre-existing corpus — same convention, same file). Every one of
 * these 63 is real backlog for the vertical-column sweep (docs/audit/wave-queue.json) to burn down leaf
 * by leaf, NOT a debt this guard is allowed to quietly grow. Lower this number only by narrowing a real
 * claim to a leaf-specific leafRe or removing a disproven one — never by widening the match-all pattern
 * this guard rejects. */
const LEGACY_BROAD_BASELINE = 58;

const MATRIX_BUILT_JSON_RE = /@matrix-built\s+(\{[\s\S]*?\})/g;
const MATRIX_BUILT_SHORTHAND_RE =
  /@matrix-built\s+modules=([^\s]+)(?:\s+cols=([^\s]+))?(?:\s+leafRe=([^\s]+))?/g;
const MATRIX_BUILT_CSV_RE = /@matrix-built\s+(?!modules=|\{)([a-z][a-z0-9_-]*(?:,[a-z][a-z0-9_-]*)+)(?=\s|\*|\/|$)/gi;

export function isLeafSpecific(leafRe) {
  const trimmed = String(leafRe ?? "").trim();
  if (!trimmed) return false;
  return !/^\^?\.[*+]\$?$/.test(trimmed);
}

export function scanEntries(readFileText = (p) => fs.readFileSync(p, "utf8"), listScripts = () =>
  fs.readdirSync(path.join(ROOT, "scripts")).filter((n) => n.startsWith("verify-") && n.endsWith(".mjs"))
) {
  const entries = [];

  const feed = JSON.parse(readFileText(path.join(ROOT, FEED_FILE)));
  for (const raw of feed.entries || []) {
    entries.push({ file: FEED_FILE, cols: raw.cols || [], leafRe: raw.leafRe ?? "", task: raw.task });
  }

  for (const name of listScripts()) {
    if (name === "verify-matrix-built-leaf-specific.mjs") continue;
    const file = `scripts/${name}`;
    const fullSource = readFileText(path.join(ROOT, file));
    // A real @matrix-built claim lives as its OWN single-line block comment on line 2, immediately
    // after the shebang (confirmed against every current producer — wave/column/shorthand guards
    // alike). Guards that document or test the tag FORMAT (e.g. verify-matrix-built-tag-present.mjs)
    // mention example tags in prose deeper in their header docblock or as body string-literal
    // fixtures — scanning the whole file misreads those as the file's own Built claim. Restrict the
    // scan to line 2 only, matching the actual convention instead of guessing a boundary.
    const source = fullSource.split("\n", 2)[1] ?? "";
    for (const m of source.matchAll(MATRIX_BUILT_JSON_RE)) {
      try {
        const tag = JSON.parse(m[1]);
        entries.push({ file, cols: tag.cols || [], leafRe: tag.leafRe ?? "", task: tag.task });
      } catch {
        // malformed legacy tag — not this guard's concern (verify-matrix-built-tag-present covers it)
      }
    }
    for (const m of source.matchAll(MATRIX_BUILT_SHORTHAND_RE)) {
      const cols = String(m[2] ?? "connectivity,reverse_link").split(",").map((s) => s.trim()).filter(Boolean);
      entries.push({ file, cols, leafRe: m[3] ?? ".*", task: "shorthand" });
    }
    for (const m of source.matchAll(MATRIX_BUILT_CSV_RE)) {
      entries.push({ file, cols: ["connectivity", "reverse_link"], leafRe: ".*", task: "csv-shorthand" });
    }
  }
  return entries;
}

export function audit(entries) {
  return entries
    .filter((e) => (e.cols || []).length && !isLeafSpecific(e.leafRe))
    .map((e) => `${e.file}: broad leafRe=${JSON.stringify(e.leafRe)} Built claim for col(s) ${e.cols.join(",")}${e.task ? ` (${e.task})` : ""}`);
}

if (process.argv.includes("--selftest")) {
  const broadOneCol = audit([{ file: "fixture", cols: ["driver"], leafRe: ".*" }]);
  if (broadOneCol.length !== 1) {
    console.error(`${LABEL} SELFTEST FAIL — broad leafRe=.* on a non-reverse_link column escaped`);
    process.exit(1);
  }
  const broadMultiCol = audit([{ file: "fixture", cols: ["load", "trailer"], leafRe: "^.*$" }]);
  if (broadMultiCol.length !== 1) {
    console.error(`${LABEL} SELFTEST FAIL — broad ^.*$ escaped`);
    process.exit(1);
  }
  const broadPlus = audit([{ file: "fixture", cols: ["unit"], leafRe: ".+" }]);
  if (broadPlus.length !== 1) {
    console.error(`${LABEL} SELFTEST FAIL — broad .+ escaped`);
    process.exit(1);
  }
  const empty = audit([{ file: "fixture", cols: ["vendor"], leafRe: "" }]);
  if (empty.length !== 1) {
    console.error(`${LABEL} SELFTEST FAIL — empty leafRe (matches everywhere) escaped`);
    process.exit(1);
  }
  const exact = audit([{ file: "fixture", cols: ["reverse_link"], leafRe: "^detail\\.loads$" }]);
  if (exact.length) {
    console.error(`${LABEL} SELFTEST FAIL — leaf-specific tag rejected`);
    process.exit(1);
  }
  const anchored = audit([{ file: "fixture", cols: ["connectivity"], leafRe: "^(bills\\.|ap\\.)" }]);
  if (anchored.length) {
    console.error(`${LABEL} SELFTEST FAIL — real narrowing prefix regex rejected`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — broad rejected on every column, leaf-specific accepted`);
  process.exit(0);
}

/** Files this branch added/changed vs origin/main — mirrors verify-matrix-built-tag-present.mjs exactly
 * so both guards agree on what "new" means. Hard-fail scope is these files only; the pre-existing
 * corpus is real backlog for the vertical sweep, tracked (not hidden) via LEGACY_BROAD_BASELINE. */
function branchTouchedFiles() {
  try {
    const out = execSync(
      "git diff --name-only --diff-filter=ACMR origin/main...HEAD -- 'scripts/verify-*.mjs' '" + FEED_FILE + "'",
      { cwd: ROOT, encoding: "utf8" },
    );
    return new Set(out.split("\n").map((s) => s.trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

const allFailures = audit(scanEntries());
const touched = branchTouchedFiles();
const newFailures = allFailures.filter((line) => [...touched].some((f) => line.startsWith(`${f}:`)));
const legacyFailures = allFailures.filter((line) => !newFailures.includes(line));

if (newFailures.length) {
  console.error(
    `${LABEL} FAIL — ${newFailures.length} NEW/CHANGED broad (leafRe=.*-equivalent) Built claim(s) on this branch:\n- ${newFailures.join("\n- ")}`,
  );
  process.exit(1);
}
if (legacyFailures.length > LEGACY_BROAD_BASELINE) {
  console.error(
    `${LABEL} FAIL — legacy broad-claim count grew to ${legacyFailures.length} (baseline ${LEGACY_BROAD_BASELINE}). ` +
      `Lower it by narrowing a real claim to its leaf-specific leafRe, never by raising this ceiling.\n- ${legacyFailures.join("\n- ")}`,
  );
  process.exit(1);
}
console.log(
  `${LABEL} PASS — no new broad claims; ${legacyFailures.length}/${LEGACY_BROAD_BASELINE} legacy broad claims remain ` +
    `(real backlog for the vertical-column sweep, not counted as Built by the live scoreboard since matrix-built-auto.ts isLeafSpecific()).`,
);
