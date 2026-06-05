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
assertIncludes(css, "max-width: 2200px", "Missing 2560+ max-width container rule");
assertIncludes(css, ".edge-kpi-card", "Missing ultrawide KPI width marker");
assertIncludes(css, "font-size: 1.08rem;", "Missing ultrawide typography scale marker");
assertIncludes(container, "edge-ultrawide-shell", "UltraWideContainer class marker missing");

console.log("[edge-breakpoint-walk-2560] OK");
