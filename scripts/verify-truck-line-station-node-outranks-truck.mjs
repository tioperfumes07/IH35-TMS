#!/usr/bin/env node
/**
 * GUARD: on Truck Line, the station node layer must always paint ABOVE the truck graphic.
 *
 * WHY THIS EXISTS (the defect it closes, measured live 2026-09-30):
 * The owner reported, for the third time, "in truck 170 the truck appears in dispatched and not
 * in transit, and the green circle is not on." Measured against production:
 *   - T170's last telematics ping was 2026-09-29 21:06:28Z -- 15h44m stale.
 *   - `deriveLiveStation` correctly refuses to fabricate a position for a stale ping and parks
 *     the truck at the last STAMPED node, which is Dispatched (index 0).
 *   - `.truck-line-vehicle` carries `z-index: 5` and a 74x34 SVG, centred on its station.
 *   - The station node is a 17x17 dot at `top: 34` with NO z-index.
 * So the node was never "off" -- the truck graphic blanketed it. The board was telling the truth
 * and looked like a bug, which is the worst failure mode a status display can have.
 *
 * The fix is z-order, not data: parking a stale truck at its last known station is correct and
 * must stay. This guard fails if either station-node container loses `zIndex: 6`, or if the
 * truck layer is ever raised to meet it.
 *
 * Usage:  node scripts/verify-truck-line-station-node-outranks-truck.mjs
 *         node scripts/verify-truck-line-station-node-outranks-truck.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-truck-line-station-node-outranks-truck";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/dispatch/TruckLineBoard.tsx";

const TRUCK_LAYER_Z = 5;
const STATION_LAYER_Z = 6;

export function assertStationNodeOutranksTruck(src) {
  const problems = [];

  // 1. The truck layer's z-index. There is more than one `.truck-line-vehicle` rule (the base
  //    rule and a prefers-reduced-motion override), and rule ORDER is not guaranteed, so read
  //    every one of them and take the highest z-index any of them declares -- that is the
  //    z-index the station nodes actually have to beat.
  const truckRules = [...src.matchAll(/\.truck-line-vehicle\s*\{([^}]*)\}/g)].map((m) => m[1]);
  if (!truckRules.length) {
    problems.push(`${TARGET}: the .truck-line-vehicle CSS rule is gone -- this guard cannot verify z-order.`);
    return problems;
  }
  const truckZs = truckRules
    .map((body) => body.match(/z-index:\s*(\d+)/))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  if (!truckZs.length) {
    problems.push(`${TARGET}: no .truck-line-vehicle rule declares a z-index; the station nodes can no longer be proven to outrank it.`);
    return problems;
  }
  const truckZ = Math.max(...truckZs);

  // 2. Both station-node containers must carry an explicit, higher z-index.
  // The style object interpolates `${left}` so it contains braces of its own -- match to the
  // JSX close, not to the first `}`.
  const nodeContainers = [...src.matchAll(/<div key=\{i\} className="absolute" style=\{\{.*?\}\}>/gs)].map((m) => m[0]);
  if (nodeContainers.length < 2) {
    problems.push(
      `${TARGET}: expected 2 station-node containers (the progress stations and the On time / Exception station), found ${nodeContainers.length}.`
    );
  }
  for (const container of nodeContainers) {
    const z = container.match(/zIndex:\s*(\d+)/);
    if (!z) {
      problems.push(
        `${TARGET}: a station-node container declares no zIndex, so the 74x34 truck graphic (z-index ${truckZ}) paints over the 17px station dot. ` +
          `That is the T170 "the green circle is not on" defect. Give it zIndex: ${STATION_LAYER_Z}.`
      );
      continue;
    }
    if (Number(z[1]) <= truckZ) {
      problems.push(
        `${TARGET}: a station-node container has zIndex ${z[1]}, which does not outrank the truck layer's z-index ${truckZ}. ` +
          `The station dot will be hidden wherever the truck sits.`
      );
    }
  }

  // 3. A stale / no-ping truck must render muted, never as a live position.
  if (!/parked=\{live\.signalLabel\s*!==\s*"Live"\}/.test(src)) {
    problems.push(
      `${TARGET}: the truck graphic no longer renders \`parked\` for a non-Live signal. A Stale or No ping truck is the LAST KNOWN ` +
        `position and must not be drawn the same as a live one.`
    );
  }

  // 4. The stale fallback itself must stay honest -- never fabricate a station.
  if (!/if\s*\(pos\.stale\)\s*\{\s*return\s*\{\s*v7Index:\s*parkedFallback/.test(src)) {
    problems.push(
      `${TARGET}: deriveLiveStation no longer parks a stale ping at the last STAMPED node. Never fabricate a position for a truck ` +
        `that has not reported -- the fix for "the truck is in the wrong place" is z-order and the stamp engine, never a guessed station.`
    );
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const good = fs.readFileSync(path.join(ROOT, TARGET), "utf8");

  const expect = (name, src, needle) => {
    const problems = assertStationNodeOutranksTruck(src);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: planted defect NOT caught (got: ${problems.join(" | ") || "no problems"})`);
    }
  };

  // 0. The live file must be clean.
  const live = assertStationNodeOutranksTruck(good);
  if (live.length) failures.push(`live-file: ${live.join(" | ")}`);

  // 1. THE REAL REGRESSION -- station container loses its zIndex (the shipped state before today).
  expect("node-loses-zindex", good.replace(/, top: 0, zIndex: 6 \}\}>/, ", top: 0 }}>"), "declares no zIndex");

  // 2. zIndex present but not high enough.
  expect("node-zindex-too-low", good.replace(/zIndex: 6/g, "zIndex: 3"), "does not outrank the truck layer");

  // 3. Truck layer raised to meet the nodes.
  expect("truck-layer-raised", good.replace(/z-index: 5;/, "z-index: 9;"), "does not outrank the truck layer");

  // 4. The muted-stale render is dropped.
  expect("stale-not-muted", good.replace(/parked=\{live\.signalLabel !== "Live"\}/, "parked={false}"), "no longer renders `parked`");

  // 5. Someone "fixes" the owner complaint by fabricating a station for a stale ping.
  expect(
    "fabricated-stale-station",
    good.replace(/if \(pos\.stale\) \{\s*\n\s*return \{ v7Index: parkedFallback/, "if (pos.stale) {\n    return { v7Index: 3"),
    "no longer parks a stale ping"
  );

  // 6. The CSS rules are deleted outright (there is a base rule AND a reduced-motion override,
  //    so both must go for this path).
  expect("truck-rule-deleted", good.replace(/\.truck-line-vehicle\s*\{[^}]*\}/g, ""), "CSS rule is gone");

  // 7. The rules survive but every z-index is dropped.
  expect("truck-zindex-dropped", good.replace(/z-index: 5;/, "opacity: 1;"), "no .truck-line-vehicle rule declares a z-index");

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED (${failures.length})`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`${LABEL} selftest 7/7 OK`);
  }
} else {
  const src = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
  const problems = assertStationNodeOutranksTruck(src);
  if (problems.length) {
    console.error(`${LABEL} FAILED (${problems.length})`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}
