#!/usr/bin/env node
/**
 * GUARD: on Truck Line, the CURRENT LOCATION header must sit over the column that holds the
 * locations — not over the rail.
 *
 * WHY (owner, live, 2026-09-30): "change the location header to the correct column, it was next to
 * transit." The header was ONE centred cell reading "TRANSIT · CURRENT LOCATION" spanning the whole
 * sixth grid track. The BODY of that track is two things:
 *     [ rail — flex-1 ][ CURRENT LOCATION — w-[168px] shrink-0, right ]
 * so the words CURRENT LOCATION rendered centred over the RAIL, while the locations themselves sat
 * 168px to the right under no header at all. A column header that does not sit over its column is
 * worse than none: it labels the wrong data.
 *
 * THE RULE: the header mirrors the body. Same two cells, same fixed width, in the same order.
 *
 * Usage:  node scripts/verify-truck-line-location-header-over-its-column.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-truck-line-location-header-over-its-column";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/dispatch/TruckLineBoard.tsx";

export function assertLocationHeaderOverItsColumn(src) {
  const problems = [];

  const header = src.match(/<div className="truck-line-v4-transit-header[^"]*">([\s\S]*?)<\/div>\s*<\/div>/);
  if (!header) {
    problems.push(`${TARGET}: the transit header cell is gone — this guard cannot verify the column labelling.`);
    return problems;
  }
  const head = header[1];

  // The single combined label is the exact defect.
  if (/TRANSIT\s*·\s*CURRENT LOCATION/.test(head)) {
    problems.push(
      `${TARGET}: the header is still the single combined label "TRANSIT · CURRENT LOCATION". It spans the whole ` +
        `track and centres over the RAIL, so CURRENT LOCATION labels the rail instead of the 168px column that ` +
        `actually holds the locations.`
    );
  }
  if (!/>TRANSIT</.test(head)) {
    problems.push(`${TARGET}: the header no longer carries a TRANSIT label over the rail.`);
  }
  if (!/>CURRENT LOCATION</.test(head)) {
    problems.push(`${TARGET}: the header no longer carries a CURRENT LOCATION label.`);
  }

  // The location header must carry the SAME fixed width as the body cell it labels.
  const bodyWidth = src.match(/className="truck-line-v4-cap w-\[(\d+)px\] shrink-0/);
  if (!bodyWidth) {
    problems.push(`${TARGET}: the CURRENT LOCATION body cell no longer declares a fixed width — the header cannot be aligned to it.`);
  } else {
    const headerLoc = head.match(/w-\[(\d+)px\] shrink-0[^>]*>CURRENT LOCATION</);
    if (!headerLoc) {
      problems.push(
        `${TARGET}: the CURRENT LOCATION header does not declare "w-[${bodyWidth[1]}px] shrink-0". It must mirror the ` +
          `body cell exactly or it drifts off its own column again.`
      );
    } else if (headerLoc[1] !== bodyWidth[1]) {
      problems.push(
        `${TARGET}: the CURRENT LOCATION header is ${headerLoc[1]}px wide while its body cell is ${bodyWidth[1]}px. ` +
          `The header must mirror the body.`
      );
    }
  }

  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, TARGET), "utf8");

if (process.argv.includes("--selftest")) {
  const failures = [];
  const good = read();
  const expect = (name, src, needle) => {
    const problems = assertLocationHeaderOverItsColumn(src);
    if (!problems.some((p) => p.includes(needle))) failures.push(`${name}: planted defect NOT caught (got: ${problems.join(" | ") || "none"})`);
  };

  const live = assertLocationHeaderOverItsColumn(good);
  if (live.length) failures.push(`live: ${live.join(" | ")}`);

  // 1. THE REAL REGRESSION — the single combined label returns verbatim.
  expect(
    "combined-label-back",
    good.replace(/<div className="truck-line-v4-transit-header flex items-center">[\s\S]*?<\/div>\n/, '<div className="truck-line-v4-transit-header">TRANSIT · CURRENT LOCATION</div>\n'),
    'single combined label'
  );
  // 2. The header width stops matching the body.
  expect("width-drifts", good.replace('w-[168px] shrink-0 text-left">CURRENT LOCATION', 'w-[120px] shrink-0 text-left">CURRENT LOCATION'), "wide while its body cell is");
  // 3. The header loses its fixed width entirely.
  expect("width-removed", good.replace('<span className="w-[168px] shrink-0 text-left">CURRENT LOCATION</span>', '<span className="text-left">CURRENT LOCATION</span>'), "does not declare");
  // 4. The TRANSIT label disappears.
  expect("transit-label-gone", good.replace('>TRANSIT</span>', '></span>'), "no longer carries a TRANSIT label");
  // 5. The CURRENT LOCATION label disappears.
  expect("location-label-gone", good.replace('>CURRENT LOCATION</span>', '></span>'), "no longer carries a CURRENT LOCATION label");

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED (${failures.length})`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`${LABEL} selftest 5/5 OK`);
  }
} else {
  const problems = assertLocationHeaderOverItsColumn(read());
  if (problems.length) {
    console.error(`${LABEL} FAILED (${problems.length})`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}
