#!/usr/bin/env node
import fs from "node:fs";

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assertIncludes(source, marker, message) {
  if (!source.includes(marker)) throw new Error(message);
}

const css = read("apps/frontend/src/styles/breakpoints-edge.css");
const container = read("apps/frontend/src/components/layout/UltraWideContainer.tsx");

assertIncludes(css, "@media (min-width: 2560px)", "Missing 2560+ media query");
// LV-CONTENT-AUTO-SIZE-TO-BROWSER (owner directive): content fills the browser at any size — no
// fixed content-width cap on ultrawide monitors.
if (css.includes("max-width: 2200px")) {
  throw new Error("breakpoints-edge.css must NOT reintroduce the removed 2200px ultrawide content cap");
}
assertIncludes(css, ".edge-kpi-card", "Missing ultrawide KPI width marker");
assertIncludes(css, "font-size: 1.08rem;", "Missing ultrawide typography scale marker");
assertIncludes(container, "edge-ultrawide-shell", "UltraWideContainer class marker missing");

console.log("[edge-breakpoint-walk-2560] OK");
