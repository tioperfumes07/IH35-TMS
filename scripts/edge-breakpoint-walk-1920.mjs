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

assertIncludes(css, "@media (min-width: 1920px)", "Missing 1920+ media query");
assertIncludes(css, "max-width: 1800px", "Missing 1920+ max-width container rule");
assertIncludes(css, ".edge-ultrawide-shell", "Missing ultrawide shell selector");
assertIncludes(container, "edge-ultrawide-shell", "UltraWideContainer class marker missing");
assertIncludes(container, "../../styles/breakpoints-edge.css", "UltraWideContainer must import edge stylesheet");

console.log("[edge-breakpoint-walk-1920] OK");
