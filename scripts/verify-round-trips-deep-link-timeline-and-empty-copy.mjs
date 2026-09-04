import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const roundTripsPath = resolve(root, "apps/frontend/src/pages/dispatch/RoundTrips.tsx");
const timelinePath = resolve(root, "apps/frontend/src/pages/dispatch/RoundTripsTimeline.tsx");
const dispatchPath = resolve(root, "apps/frontend/src/pages/Dispatch.tsx");

const emptyCopy = "No open tours. A tour opens when a northbound load is booked from the yard.";
const fails = [];

function read(p) {
  return readFileSync(p, "utf8");
}

const roundTrips = read(roundTripsPath);
const timeline = read(timelinePath);
const dispatch = read(dispatchPath);

if (!roundTrips.includes("deepLink?: boolean;")) {
  fails.push("RoundTrips Props missing optional deepLink prop");
}

if (!/function readView\(deepLink\?\s*:\s*boolean\)\s*:\s*BoardView/.test(roundTrips)) {
  fails.push("readView does not accept a deepLink parameter");
}

if (!roundTrips.includes("return deepLink ? \"timeline\" : \"board\";")) {
  fails.push("readView does not default to timeline when deepLink is true and no saved view exists");
}

if (!roundTrips.includes("const [boardView, setBoardView] = useState<BoardView>(() => readView(deepLink));")) {
  fails.push("RoundTrips boardView state does not initialize from readView(deepLink)");
}

if (!roundTrips.includes(emptyCopy)) {
  fails.push(`RoundTrips board empty-state copy missing: "${emptyCopy}"`);
}

if (!timeline.includes(emptyCopy)) {
  fails.push(`RoundTripsTimeline empty-state copy missing: "${emptyCopy}"`);
}

if (!dispatch.includes("deepLink={roundTripsRoute}")) {
  fails.push("DispatchPage does not pass deepLink={roundTripsRoute} to RoundTrips");
}

if (fails.length) {
  console.error("Round-trips BRD-10 contract failures:");
  for (const f of fails) console.error(`  · ${f}`);
  process.exit(1);
}

console.log("Round-trips BRD-10 contract OK: deep-link defaults to timeline and empty-state copy is present.");
