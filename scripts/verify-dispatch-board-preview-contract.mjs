#!/usr/bin/env node
/**
 * DESIGN-CONTRACT-DISPATCH-BOARD-2026-09-05 §A guard (L.4a, LEAD RESET 12:45Z surrender to CC-2).
 * Reference: docs/design/DESIGN-CONTRACT-DISPATCH-BOARD-2026-09-05.md +
 * docs/design/reference/DISPATCH-BOARD-PREVIEW-2026-09-05.pdf.
 *
 * Static (CI-safe, no browser): asserts the source-level facts that must hold for the board to
 * match the preview — no column hidden by default, the 5 named group bands present in the PDF's
 * order, "Live loc" (not "Location"), drag-reorder/resize still wired, headers left-aligned.
 *
 * A companion LIVE check (getComputedStyle-based, real page) is a follow-up — this file pins the
 * structural contract the live check would otherwise have nothing to verify against.
 *
 *   node scripts/verify-dispatch-board-preview-contract.mjs
 *   node scripts/verify-dispatch-board-preview-contract.mjs --selftest
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BOARD = join(ROOT, "apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
const LABEL = "verify-dispatch-board-preview-contract";

const EXPECTED_GROUPS = ["Assignment", "Hours of service", "Load", "Telemetry", "Status"];

function problems(src) {
  const issues = [];

  // 1. No column ever hidden by default (§A: "there is no hidden default").
  if (/\bconst\s+DEFAULT_VISIBLE_BOARD_KEYS\s*=/.test(src)) {
    issues.push("DEFAULT_VISIBLE_BOARD_KEYS must not exist — every column defaults visible");
  }
  const parityMap = src.match(/const\s+parityColumns[\s\S]*?boardColumns\.map\(\(column\)\s*=>\s*\(\{[\s\S]*?\}\)\)/)?.[0] ?? "";
  if (!parityMap) issues.push("parityColumns mapping not found");
  else if (/defaultHidden\s*:/.test(parityMap)) issues.push("parityColumns must not set defaultHidden on any column");

  // 2. The 5 group bands, in the PDF's exact order.
  const groupsBlock = src.match(/const\s+boardColumnGroups\s*=\s*\[([\s\S]*?)\n\s*\];/)?.[0] ?? "";
  if (!groupsBlock) issues.push("boardColumnGroups not found");
  else {
    const foundLabels = [...groupsBlock.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]);
    if (foundLabels.join(",") !== EXPECTED_GROUPS.join(",")) {
      issues.push(`group order/labels drifted. expected: ${EXPECTED_GROUPS.join(",")} found: ${foundLabels.join(",")}`);
    }
  }
  if (!/columnGroups=\{boardColumnGroups\}/.test(src)) {
    issues.push("boardColumnGroups must be passed to the board's ParityTable mount(s)");
  }
  const groupMounts = [...src.matchAll(/<ParityTable[\s\S]{0,400}?columnGroups=\{boardColumnGroups\}/g)].length;
  if (groupMounts < 2) issues.push(`columnGroups={boardColumnGroups} must reach both List and Table mounts (found ${groupMounts})`);

  // 3. "Live loc" replaces the bare "Location" header (§A — truck's current GPS position, not a
  // third address). Same key/data — a display-label rename only.
  if (!/key:\s*"location",\s*header:\s*"Live loc"/.test(src)) {
    issues.push('the "location" column header must read "Live loc", not "Location"');
  }
  if (/header:\s*"Location"/.test(src)) {
    issues.push('a bare "Location" header must not remain on the board column model');
  }

  // 4. Drag reorder/resize still wired (§A: "Drag is back") — neither board mount may disable it.
  if (!/enableColumnReorder/.test(src)) issues.push("board ParityTable must pass enableColumnReorder");
  if (/enableColumnReorder=\{false\}/.test(src)) issues.push("board ParityTable must not disable enableColumnReorder");
  if (!/enableColumnResize/.test(src)) issues.push("board ParityTable must pass enableColumnResize");
  if (/enableColumnResize=\{false\}/.test(src)) issues.push("board ParityTable must not disable enableColumnResize");

  // 5. Headers left-aligned over left-aligned data (§A: centered dispatch-board headers are a
  // named defect in the reference).
  if (!/className:\s*"text-left"/.test(parityMap)) {
    issues.push("parityColumns must set className: \"text-left\" (headers left-aligned, not centered)");
  }

  // 6. First four columns sticky-left (§14: "first four columns sticky-left"). ASSIGNMENT
  // (Unit/Trailer/Load #/Driver) is the leading group in boardColumns, so stickyLeftCount={4}
  // sticks exactly that group.
  const stickyMounts = [...src.matchAll(/<ParityTable[\s\S]{0,400}?stickyLeftCount=\{4\}/g)].length;
  if (stickyMounts < 2) {
    issues.push(`stickyLeftCount={4} must reach both List and Table ParityTable mounts (found ${stickyMounts})`);
  }

  // 7. L.4a-fix (inventory #7,#37) — real column widths (no more 34px equal-split truncation) and
  // a Live loc floor wide enough for the GPS city/state + freshness content.
  const autoLayoutMounts = [...src.matchAll(/<ParityTable[\s\S]{0,500}?columnLayout="auto"/g)].length;
  if (autoLayoutMounts < 2) {
    issues.push(`columnLayout="auto" must reach both List and Table ParityTable mounts (found ${autoLayoutMounts})`);
  }
  if (!/minWidth:\s*column\.key === "location" \? 180/.test(src)) {
    issues.push('the "location" (Live loc) column must carry a 180px minWidth floor');
  }

  // 8. Driver → initials, full name on hover (§37: "Driver → initials").
  if (!/function driverInitials\(/.test(src)) {
    issues.push("driverInitials() helper must exist");
  }
  if (!/title=\{fullName\}/.test(src)) {
    issues.push("renderDriverCell must wrap the cell in a title={fullName} hover");
  }

  // 9. 1px #C7D2DC outer frame (§14) on the board's ParityTable mounts.
  const frameMounts = [...src.matchAll(/<ParityTable[\s\S]{0,600}?frameColor=\{colors\.tableColumnRule\}/g)].length;
  if (frameMounts < 2) {
    issues.push(`frameColor={colors.tableColumnRule} must reach both List and Table ParityTable mounts (found ${frameMounts})`);
  }

  return issues;
}

function selftest() {
  const src = readFileSync(BOARD, "utf8");
  const mutants = [
    src.replace(
      "const parityColumns: ParityColumn<BoardLoad>[] = boardColumns.map((column) => ({",
      'const DEFAULT_VISIBLE_BOARD_KEYS = new Set(["unit"]);\n  const parityColumns: ParityColumn<BoardLoad>[] = boardColumns.map((column) => ({\n    defaultHidden: !DEFAULT_VISIBLE_BOARD_KEYS.has(column.key),',
    ),
    src.replace('{ label: "Assignment", keys:', '{ label: "Assignment Renamed", keys:'),
    src.replace('key: "location",\n      header: "Live loc",', 'key: "location",\n      header: "Location",'),
    src.replace("enableColumnReorder\n", "enableColumnReorder={false}\n"),
    src.replace('className: "text-left",\n', ""),
    src.replace(/stickyLeftCount=\{4\}\n/, ""), // only removes the first occurrence — still catches the drop
    src.replace(/columnLayout="auto"\n/, ""),
    src.replace('minWidth: column.key === "location" ? 180 : undefined,', ""),
    src.replace("function driverInitials(", "function driverInitialsRenamed("),
    src.replace("title={fullName}", "data-name={fullName}"),
    src.replace(/frameColor=\{colors\.tableColumnRule\}\n/, ""),
  ];
  let caught = 0;
  for (const mutant of mutants) {
    if (problems(mutant).length > 0) caught += 1;
  }
  if (caught !== mutants.length) {
    console.error(`${LABEL}: SELFTEST FAIL — ${caught}/${mutants.length} planted defects caught`);
    process.exit(1);
  }
  if (problems(src).length > 0) {
    console.error(`${LABEL}: SELFTEST FAIL — clean source unexpectedly flagged: ${problems(src).join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST PASS — ${caught}/${mutants.length} planted defects caught`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const src = readFileSync(BOARD, "utf8");
const issues = problems(src);
if (issues.length) {
  console.error(`FAIL ${LABEL}:`);
  for (const issue of issues) console.error(`  - ${issue}`);
  process.exit(1);
}
console.log(`PASS ${LABEL} — group bands, visibility, rename, drag, and alignment all hold`);
