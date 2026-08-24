#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leaves":["load.drawer.assignment_history"],"task":"DISP-F5860-ASSIGNMENT-HISTORY-REVERSE-EXACT-LEAF","vertical":"column-wave"} */
/**
 * LoadDetailDrawer Assignment History must EntityLink previous/new drivers, units, and trailers
 * (Exact Leaves load.drawer.assignment_history:reverse_link / driver / unit / trailer).
 *
 * FAIL: plain "Driver {prev} → {next}" text with no EntityLinkOrTombstone.
 * PASS: data-testid load-drawer-assignment-prev-driver-link +
 *       load-drawer-assignment-new-driver-link with EntityLinkOrTombstone kind=driver.
 *
 * Self-test: node scripts/verify-load-drawer-assignment-history-driver-entitylinks.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-drawer-assignment-history-driver-entitylinks";
const TARGET = "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx";
const BACKEND = "apps/backend/src/dispatch/quick-assign.service.ts";
const MATRIX = "docs/specs/scoreboard/modules/dispatch.required.json";
const SELF = "scripts/verify-load-drawer-assignment-history-driver-entitylinks.mjs";
const HEADER = '/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leaves":["load.drawer.assignment_history"],"task":"DISP-F5860-ASSIGNMENT-HISTORY-REVERSE-EXACT-LEAF","vertical":"column-wave"} */';

function audit(src, backend, matrix, self) {
  const failures = [];
  if (!/EntityLinkOrTombstone/.test(src)) failures.push(`${TARGET}: must use EntityLinkOrTombstone`);
  if (!/data-testid=["']load-drawer-assignment-prev-driver-link["']/.test(src)) failures.push(`${TARGET}: missing previous-driver drill`);
  if (!/data-testid=["']load-drawer-assignment-new-driver-link["']/.test(src)) failures.push(`${TARGET}: missing new-driver drill`);
  if (!/data-testid=["']load-drawer-assignment-history-driver-links["']/.test(src)) failures.push(`${TARGET}: missing assignment-history driver strip`);
  if (!/data-testid=["']load-drawer-assignment-prev-unit-link["']/.test(src)) failures.push(`${TARGET}: missing previous-unit drill`);
  if (!/data-testid=["']load-drawer-assignment-new-unit-link["']/.test(src)) failures.push(`${TARGET}: missing new-unit drill`);
  if (!/data-testid=["']load-drawer-assignment-history-unit-links["']/.test(src)) failures.push(`${TARGET}: missing assignment-history unit strip`);
  if (!/data-testid=["']load-drawer-assignment-prev-trailer-link["']/.test(src)) failures.push(`${TARGET}: missing previous-trailer drill`);
  if (!/data-testid=["']load-drawer-assignment-new-trailer-link["']/.test(src)) failures.push(`${TARGET}: missing new-trailer drill`);
  if (!/data-testid=["']load-drawer-assignment-history-trailer-links["']/.test(src)) failures.push(`${TARGET}: missing assignment-history trailer strip`);
  if (!/pt\.equipment_number AS previous_trailer_number/.test(backend)) failures.push(`${BACKEND}: missing previous-trailer label`);
  if (!/nt\.equipment_number AS new_trailer_number/.test(backend)) failures.push(`${BACKEND}: missing new-trailer label`);
  if (!/pt\.id = h\.previous_trailer_id/.test(backend)) failures.push(`${BACKEND}: missing previous-trailer join`);
  if (!/nt\.id = h\.new_trailer_id/.test(backend)) failures.push(`${BACKEND}: missing new-trailer join`);
  // Planted defect class: plain Driver {prev} → {next} without EntityLink
  if (/Driver \{prev\} → \{next\}/.test(src)) failures.push(`${TARGET}: must not render plain driver IDs`);
  try {
    const leaf = JSON.parse(matrix).leaves?.find((item) => item.id === "load.drawer.assignment_history");
    if (!leaf?.required?.includes("reverse_link")) failures.push(`${MATRIX}: exact leaf must require reverse_link`);
  } catch {
    failures.push(`${MATRIX}: Required matrix must parse`);
  }
  if (!self.split("\n").includes(HEADER)) failures.push(`${SELF}: exact Built annotation drifted`);
  return failures;
}

function selftest() {
  const src = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
  const backend = fs.readFileSync(path.join(ROOT, BACKEND), "utf8");
  const matrix = fs.readFileSync(path.join(ROOT, MATRIX), "utf8");
  const self = fs.readFileSync(path.join(ROOT, SELF), "utf8");
  if (audit(src, backend, matrix, self).length) throw new Error(`${LABEL}: live files must pass`);
  const plants = [
    ["previous driver", src.replace('data-testid="load-drawer-assignment-prev-driver-link"', 'data-testid="removed-prev-driver"'), backend, matrix, self],
    ["new driver", src.replace('data-testid="load-drawer-assignment-new-driver-link"', 'data-testid="removed-new-driver"'), backend, matrix, self],
    ["driver strip", src.replace('data-testid="load-drawer-assignment-history-driver-links"', 'data-testid="removed-driver-strip"'), backend, matrix, self],
    ["previous unit", src.replace('data-testid="load-drawer-assignment-prev-unit-link"', 'data-testid="removed-prev-unit"'), backend, matrix, self],
    ["new unit", src.replace('data-testid="load-drawer-assignment-new-unit-link"', 'data-testid="removed-new-unit"'), backend, matrix, self],
    ["unit strip", src.replace('data-testid="load-drawer-assignment-history-unit-links"', 'data-testid="removed-unit-strip"'), backend, matrix, self],
    ["previous trailer", src.replace('data-testid="load-drawer-assignment-prev-trailer-link"', 'data-testid="removed-prev-trailer"'), backend, matrix, self],
    ["new trailer", src.replace('data-testid="load-drawer-assignment-new-trailer-link"', 'data-testid="removed-new-trailer"'), backend, matrix, self],
    ["trailer strip", src.replace('data-testid="load-drawer-assignment-history-trailer-links"', 'data-testid="removed-trailer-strip"'), backend, matrix, self],
    ["previous trailer label", src, backend.replace("pt.equipment_number AS previous_trailer_number", "NULL AS previous_trailer_number"), matrix, self],
    ["new trailer label", src, backend.replace("nt.equipment_number AS new_trailer_number", "NULL AS new_trailer_number"), matrix, self],
    ["previous trailer join", src, backend.replace("pt.id = h.previous_trailer_id", "pt.id = NULL"), matrix, self],
    ["new trailer join", src, backend.replace("nt.id = h.new_trailer_id", "nt.id = NULL"), matrix, self],
    ["Required", src, backend, matrix.replace('"id": "load.drawer.assignment_history"', '"id": "load.drawer.assignment_history.removed"'), self],
    ["header", src, backend, matrix, self.replace('"leaves":["load.drawer.assignment_history"]', '"leaves":["load.drawer.pre_settlement"]')],
  ];
  for (const [name, nextSrc, nextBackend, nextMatrix, nextSelf] of plants) {
    if (!audit(nextSrc, nextBackend, nextMatrix, nextSelf).length) throw new Error(`${LABEL}: planted ${name} defect escaped`);
  }
  console.log(`${LABEL}: OK — selftest 15/15 in-memory defects rejected`);
}

const mode = process.argv.includes("--selftest") ? "selftest" : "check";
try {
  if (mode === "selftest") selftest();
  else {
    const failures = audit(
      fs.readFileSync(path.join(ROOT, TARGET), "utf8"),
      fs.readFileSync(path.join(ROOT, BACKEND), "utf8"),
      fs.readFileSync(path.join(ROOT, MATRIX), "utf8"),
      fs.readFileSync(path.join(ROOT, SELF), "utf8"),
    );
    if (failures.length) throw new Error(failures.join("\n"));
    console.log(`${LABEL}: OK`);
  }
} catch (e) {
  console.error(String(e?.message || e));
  process.exit(1);
}
