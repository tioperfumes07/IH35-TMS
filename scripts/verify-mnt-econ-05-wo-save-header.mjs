#!/usr/bin/env node
/**
 * MNT-ECON-05 — WorkOrderDetailPage "Save header" must not be a dead control.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PAGE = "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx";

function fail(msg) {
  console.error(`verify-mnt-econ-05-wo-save-header FAILED — ${msg}`);
  process.exit(1);
}

function main() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  if (!/Save header/.test(src)) fail(`${PAGE} must still expose Save header (Rule 07 — do not delete)`);
  // The Save header button must carry an onClick (wired to edit/PATCH path).
  const idx = src.indexOf("Save header");
  const window = src.slice(Math.max(0, idx - 400), idx + 40);
  if (!/onClick\s*=/.test(window)) {
    fail(`${PAGE}: Save header button must have an onClick handler (dead-control trap)`);
  }
  if (!/data-testid="wo-save-header-btn"/.test(src)) {
    fail(`${PAGE}: Save header must keep data-testid=wo-save-header-btn`);
  }
  console.log("verify-mnt-econ-05-wo-save-header OK");
}

main();
