#!/usr/bin/env node
/**
 * GUARD — the truck's exhaust must finish INSIDE the SVG viewBox, and the date must stay smaller
 * than the other primaries.
 *
 * OWNER, LIVE 2026-09-30, two separate reports on the same board:
 *   "the truck is not showing the smoke completely as if part of it is cut"
 *   "you might actually need to reduce the text size of the pu and delivery date, it is larger
 *    than that of the text in tour, unit load"
 *
 * SMOKE. The exhaust keyframe ends at translate(-7px, -7px) scale(1.9) on a puff drawn at cy=7
 * r=3.2, so its top edge finishes at y = 7 - 7 - (3.2 * 1.9) = -6.08. The viewBox began at y = 0.
 * An SVG clips at its own viewBox regardless of the room around it -- measured in Chrome, the
 * vehicle, the rail cell, the 70px flex row and the 74px board row are ALL overflow:visible, so
 * nothing outside the element was cutting it. This guard does the arithmetic rather than pinning a
 * magic number: it reads the puff geometry, the keyframe, the viewBox and the height out of the
 * source and fails if the animation's extent falls outside the box.
 *
 * ALIGNMENT. The box grew upward, so the container's `top` had to move by the same amount or the
 * truck would float off the rail. The guard requires viewBoxTop + height to equal the old bottom
 * edge (38) and top + height to equal it too, so the two can never drift apart again.
 *
 * DATE SIZE. Measured in the owner's own Chrome before changing anything: the dates and
 * UNIT/TOUR/LOAD were all rendering at exactly 14px -- identical, not larger. They READ larger
 * because a ten-character date at 14px dominates a four-character unit number. The fix he asked for
 * is still the right one; the guard just makes sure the date class exists, is applied to BOTH dates,
 * and caps smaller than the primary size it overrides.
 *
 * SELFTEST: --selftest plants each regression and requires the guard to catch it.
 */
import { readFileSync } from "node:fs";

const FILE = "apps/frontend/src/pages/dispatch/TruckLineBoard.tsx";
const OLD_BOTTOM_EDGE = 38; // 4 + 34, the pre-change bottom of the vehicle box

export function checkTruckLineExhaust(source) {
  const failures = [];

  const vb = source.match(/viewBox="(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)"/);
  const svgHeight = source.match(/height="(\d+(?:\.\d+)?)"\s*\n\s*viewBox=/);
  const top = source.match(/top:\s*(-?\d+(?:\.\d+)?),\s*cursor:\s*"grab"/);
  const puff = source.match(/className="puff"\s+cx="(-?[\d.]+)"\s+cy="(-?[\d.]+)"\s+r="([\d.]+)"/);
  const kf = source.match(/100%\s*\{\s*opacity:\s*0;\s*transform:\s*translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\(([\d.]+)\)/);

  if (!vb) failures.push("the vehicle SVG must declare a 4-value viewBox");
  if (!puff) failures.push("the exhaust puff must keep explicit cx/cy/r so its extent can be computed");
  if (!kf) failures.push("the truck-line-exhaust keyframe must keep an explicit translate(x,y) scale(s) end state");
  if (!top) failures.push("the vehicle container must keep an explicit numeric `top`");
  if (!svgHeight) failures.push("the vehicle SVG must declare an explicit height immediately above its viewBox");

  if (vb && puff && kf) {
    const vbTop = Number(vb[2]);
    const vbLeft = Number(vb[1]);
    const cy = Number(puff[2]);
    const cx = Number(puff[1]);
    const r = Number(puff[3]);
    const dx = Number(kf[1]);
    const dy = Number(kf[2]);
    const scale = Number(kf[3]);
    const endTop = cy + dy - r * scale;
    const endLeft = cx + dx - r * scale;
    if (endTop < vbTop) {
      failures.push(
        `the exhaust finishes at y=${endTop.toFixed(2)} but the viewBox starts at y=${vbTop} — the smoke is clipped, which is exactly what the owner reported`
      );
    }
    if (endLeft < vbLeft) {
      failures.push(`the exhaust finishes at x=${endLeft.toFixed(2)} but the viewBox starts at x=${vbLeft} — the smoke is clipped on the left`);
    }
  }

  if (vb && svgHeight && top) {
    const vbTop = Number(vb[2]);
    const h = Number(svgHeight[1]);
    const t = Number(top[1]);
    if (Number(vb[4]) !== h) failures.push(`the viewBox height (${vb[4]}) and the svg height (${h}) must match, or the drawing scales`);
    if (t + h !== OLD_BOTTOM_EDGE) {
      failures.push(
        `top(${t}) + height(${h}) = ${t + h}, but the vehicle's bottom edge must stay at ${OLD_BOTTOM_EDGE} or the truck floats off the rail`
      );
    }
    if (vbTop > 0) failures.push("the viewBox top must not be positive — that would crop the truck itself");
  }

  // date size
  if (!/\.truck-line-v4-date\s*\{\s*font-size:\s*clamp\(/.test(source)) {
    failures.push(".truck-line-v4-date must exist with its own clamped font-size — owner ruling 2026-09-30");
  }
  const dateApplied = (source.match(/truck-line-v4-primary truck-line-v4-date/g) || []).length;
  if (dateApplied < 2) {
    failures.push(`the date class must be applied to BOTH the PU and the DELIVERY date (found ${dateApplied})`);
  }
  const dateMax = source.match(/\.truck-line-v4-date\s*\{\s*font-size:\s*clamp\([^,]+,[^,]+,\s*([\d.]+)px\)/);
  if (dateMax && Number(dateMax[1]) > 13) {
    failures.push(`the date cap is ${dateMax[1]}px — it must stay below the primary size the owner asked it to sit under`);
  }

  return failures;
}

const NAME = "verify-truck-line-exhaust-fits-its-viewbox";

if (process.argv.includes("--selftest")) {
  const good = readFileSync(FILE, "utf8");
  const cases = [
    ["baseline (unmodified source)", good, 0],
    ["viewBox reverts to starting at y=0 (the shipped clip)", good.replace('viewBox="0 -12 74 46"', 'viewBox="0 0 74 34"'), 1],
    ["the box grows but `top` is not moved to match", good.replace("top: -8, cursor:", "top: 4, cursor:"), 1],
    ["svg height and viewBox height drift apart", good.replace('height="46"\n      viewBox="0 -12 74 46"', 'height="34"\n      viewBox="0 -12 74 46"'), 1],
    [
      "the exhaust is made to travel further than the box allows",
      // NOTE: mutate the KEYFRAME, not the prose. The header comment above the component quotes the
      // same numbers to explain the arithmetic, and a naive string replace hits the comment first —
      // which is how this selftest caught its own first draft producing a false PASS.
      good.replace(
        /(100%\s*\{\s*opacity:\s*0;\s*transform:\s*)translate\(-7px,\s*-7px\)\s*scale\(1\.9\)/,
        "$1translate(-14px, -14px) scale(2.6)"
      ),
      1,
    ],
    ["the date class is deleted", good.replace(/\.truck-line-v4-date \{[^}]*\}/, ""), 1],
    ["the date class is applied to only one of the two dates", good.replace("truck-line-v4-primary truck-line-v4-date", "truck-line-v4-primary", 1), 1],
    ["the date cap creeps back up to the primary size", good.replace(/(\.truck-line-v4-date \{ font-size: clamp\([^,]+,[^,]+,\s*)[\d.]+px/, "$114px"), 1],
  ];

  let ok = 0;
  for (const [label, src, expectMin] of cases) {
    const found = checkTruckLineExhaust(src).length;
    const pass = expectMin === 0 ? found === 0 : found >= expectMin;
    if (pass) ok += 1;
    else console.error(`  selftest MISS: ${label} -> ${found}, expected ${expectMin === 0 ? "0" : ">=1"}`);
  }
  console.log(`${NAME} selftest ${ok}/${cases.length} ${ok === cases.length ? "OK" : "FAILED"}`);
  if (ok !== cases.length) process.exit(1);
  console.log("--- live ---");
}

const failures = checkTruckLineExhaust(readFileSync(FILE, "utf8"));
if (failures.length > 0) {
  console.error(`${NAME} FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${NAME} PASS — the exhaust finishes inside the viewBox, the truck stays on the rail, the date sits below the primaries`);
