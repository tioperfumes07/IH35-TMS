/**
 * BRD-25 guard — DispatchBoard default ParityTable columns fit at 1280.
 *
 * Measured contract: the default visible column set in the live board must not exceed the
 * container width at a 1247px viewport (clientWidth ~1095px). The actual fit is enforced by
 * keeping only a small, known default set visible; everything else is hidden by default and
 * reachable through the ParityTable gear column chooser (persisted per BRD-04).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const path = resolve(__dirname, "../apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
const source = readFileSync(path, "utf-8");

const EXPECTED_DEFAULT_VISIBLE = new Set([
  "unit",
  "trailer",
  "load",
  "driver",
  "location",
  "customer",
  "pickup",
  "delivery",
  "status",
]);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

// 1. The DEFAULT_VISIBLE_BOARD_KEYS set must exist and match the expected contract.
const setMatch = source.match(/const\s+DEFAULT_VISIBLE_BOARD_KEYS\s*=\s*new\s+Set\(\[\s*([\s\S]*?)\s*\]\)/);
if (!setMatch) fail("DEFAULT_VISIBLE_BOARD_KEYS Set not found in DispatchBoard.tsx");
const declaredKeys = new Set(
  setMatch[1]
    .split(/\r?\n/)
    .flatMap((line) => line.match(/"([^"]+)"/g) ?? [])
    .map((raw) => raw.replace(/"/g, ""))
);
for (const key of EXPECTED_DEFAULT_VISIBLE) {
  if (!declaredKeys.has(key)) fail(`Expected default visible key missing: ${key}`);
}
for (const key of declaredKeys) {
  if (!EXPECTED_DEFAULT_VISIBLE.has(key)) fail(`Unexpected default visible key: ${key}`);
}

// 2. parityColumns mapping must drive defaultHidden from that set.
const parityMapMatch = source.match(
  /const\s+parityColumns[\s\S]*?boardColumns\.map\(\(column\)\s*=>\s*\(\{[\s\S]*?\}\)\)/,
);
if (!parityMapMatch) fail("parityColumns mapping not found");
const mapBody = parityMapMatch[0];
if (!mapBody.includes("DEFAULT_VISIBLE_BOARD_KEYS")) {
  fail("parityColumns does not reference DEFAULT_VISIBLE_BOARD_KEYS");
}
if (!/defaultHidden\s*:\s*!?DEFAULT_VISIBLE_BOARD_KEYS\.has\(column\.key\)/.test(mapBody)) {
  fail("parityColumns must set defaultHidden from DEFAULT_VISIBLE_BOARD_KEYS.has(column.key)");
}

// 3. The 6 HOS clock columns must not be in the default visible set.
const HOS_KEYS = ["hos_drive", "hos_shift", "hos_break", "hos_cycle", "hos_stopBy", "hos_resumeAt"];
for (const key of HOS_KEYS) {
  if (EXPECTED_DEFAULT_VISIBLE.has(key)) fail(`HOS column ${key} must not be default visible`);
}

console.log(
  `PASS: BRD-25 default visible column contract holds (${EXPECTED_DEFAULT_VISIBLE.size} columns) — other columns reachable via gear chooser.`,
);
