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
const LEGACY_BROAD_BASELINE = 55;

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

  // ACCT-F5163 fix: editing an EXISTING broad entry's non-leafRe metadata (e.g. its modules list, in
  // a shared feed file also holding sibling entries) must NOT re-trigger a hard-fail — this is the
  // exact false positive that motivated splitNewVsLegacy().
  const sameFeedFile = "docs/specs/scoreboard/wire-sprint-built.json";
  const mainSiblingEntries = [
    { file: sameFeedFile, cols: ["ap_bill"], leafRe: ".*", task: "WAVE-C-ap-bill-fe-all-modules" },
    { file: sameFeedFile, cols: ["trailer"], leafRe: ".*", task: "WAVE-A-trailer-all-modules" },
  ];
  const currentSiblingEntries = [
    { file: sameFeedFile, cols: ["ap_bill"], leafRe: ".*", task: "WAVE-C-ap-bill-fe-all-modules" },
    // trailer entry's module list changed (honest correction) — same (file, task) identity, still broad.
    { file: sameFeedFile, cols: ["trailer"], leafRe: ".*", task: "WAVE-A-trailer-all-modules" },
  ];
  const editedSibling = splitNewVsLegacy(currentSiblingEntries, mainSiblingEntries);
  if (editedSibling.newFailures.length !== 0 || editedSibling.legacyFailures.length !== 2) {
    console.error(
      `${LABEL} SELFTEST FAIL — editing one shared-file entry's metadata false-flagged a sibling entry as new ` +
        `(got ${editedSibling.newFailures.length} new / ${editedSibling.legacyFailures.length} legacy, want 0 new / 2 legacy)`,
    );
    process.exit(1);
  }

  // A genuinely NEW broad claim (task never existed at origin/main) must still hard-fail.
  const withNewTask = [...currentSiblingEntries, { file: "scripts/verify-brand-new.mjs", cols: ["driver"], leafRe: ".*", task: "BRAND-NEW-TASK" }];
  const withNewTaskResult = splitNewVsLegacy(withNewTask, mainSiblingEntries);
  if (withNewTaskResult.newFailures.length !== 1) {
    console.error(`${LABEL} SELFTEST FAIL — a genuinely new broad-claim task escaped detection`);
    process.exit(1);
  }

  // An entry that flips from leaf-specific (at origin/main) back to broad must still hard-fail as new.
  const mainWasNarrow = [{ file: "scripts/verify-x.mjs", cols: ["driver"], leafRe: "^detail\\.loads$", task: "X" }];
  const nowWidened = [{ file: "scripts/verify-x.mjs", cols: ["driver"], leafRe: ".*", task: "X" }];
  const widenedResult = splitNewVsLegacy(nowWidened, mainWasNarrow);
  if (widenedResult.newFailures.length !== 1) {
    console.error(`${LABEL} SELFTEST FAIL — a narrow-to-broad regression on an existing task escaped detection`);
    process.exit(1);
  }

  // origin/main unreachable must fail open (treat everything as new), never silently pass.
  const failOpen = splitNewVsLegacy(currentSiblingEntries, null);
  if (failOpen.newFailures.length !== 2) {
    console.error(`${LABEL} SELFTEST FAIL — unreachable origin/main must fail open to "everything new", not silently legacy`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS — broad rejected on every column, leaf-specific accepted, identity-based new-vs-legacy split verified`);
  process.exit(0);
}

/** ACCT-F5163 (2026-08-14): `branchTouchedFiles()` used to gate "new" purely by FILE path — but
 * docs/specs/scoreboard/wire-sprint-built.json is a single shared feed holding 8+ INDEPENDENT broad-
 * claim entries (ap_bill, load, trailer, unit, vendor, customer, driver, connectivity). Editing ONE
 * entry's `modules` array (an honest correction, same pattern as ACCT-F5162) touched the file, which
 * then flagged ALL 8 entries as "new/changed" — a false positive that would have hard-blocked the
 * exact kind of legitimate metadata fix this guard is supposed to allow for already-legacy entries.
 * Same problem applies to any `scripts/verify-*.mjs` file whose @matrix-built tag's `modules` list is
 * corrected without narrowing `leafRe` (e.g. a WAVE-*-all-modules guard's own floor-regression fix).
 *
 * FIX: identity-based diffing instead of file-based. An entry is only "new" if no broad-claim entry
 * with the SAME (file, task) identity existed in origin/main's committed state — i.e. the ratchet's
 * real job is "did the SET of broad claims grow", not "did any byte in a shared file change". Editing
 * an EXISTING broad claim's module list, or fixing unrelated code in the same script file, no longer
 * re-triggers a hard-fail; it stays counted in the legacy baseline where it already was. A genuinely
 * new task, or an entry that flips from leaf-specific back to broad, still hard-fails as new. */
function originMainEntries() {
  try {
    const feedText = execSync(`git show origin/main:${FEED_FILE}`, { cwd: ROOT, encoding: "utf8" });
    const listOut = execSync("git ls-tree -r --name-only origin/main -- scripts", { cwd: ROOT, encoding: "utf8" });
    const scriptNames = listOut
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.startsWith("scripts/verify-") && s.endsWith(".mjs"))
      .map((s) => s.slice("scripts/".length));
    return scanEntries(
      (p) => {
        const rel = path.relative(ROOT, p).split(path.sep).join("/");
        if (rel === FEED_FILE) return feedText;
        return execSync(`git show origin/main:${rel}`, { cwd: ROOT, encoding: "utf8" });
      },
      () => scriptNames,
    );
  } catch {
    // origin/main unreachable (shallow clone, detached fixture, etc.) — fail open to "everything new"
    // so a broken git ref can't silently widen the ratchet; scanEntries() below still runs normally.
    return null;
  }
}

/** Pure, git-free: splits `currentEntries`' broad claims into new-vs-legacy by (file, task) identity
 * against `mainEntries`' broad claims. `mainEntries === null` fails open to "everything new" (broken
 * git ref must never silently widen the ratchet). Exported so --selftest can exercise it without git. */
export function splitNewVsLegacy(currentEntries, mainEntries) {
  const broadOf = (entries) => entries.filter((e) => (e.cols || []).length && !isLeafSpecific(e.leafRe));
  const identity = (e) => `${e.file}::${e.task ?? ""}`;
  const currentBroad = broadOf(currentEntries);
  const mainBroadIdentities = mainEntries === null ? null : new Set(broadOf(mainEntries).map(identity));
  const lines = audit(currentBroad);
  const isNew = currentBroad.map((e) => mainBroadIdentities === null || !mainBroadIdentities.has(identity(e)));
  const newFailures = lines.filter((_, i) => isNew[i]);
  const legacyFailures = lines.filter((_, i) => !isNew[i]);
  return { newFailures, legacyFailures };
}

const { newFailures, legacyFailures } = splitNewVsLegacy(scanEntries(), originMainEntries());

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
