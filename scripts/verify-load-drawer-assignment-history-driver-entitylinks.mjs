#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leaves":["load.drawer.assignment_history"],"task":"DISP-F5860-ASSIGNMENT-HISTORY-REVERSE-EXACT-LEAF","vertical":"column-wave"} */
/**
 * LoadDetailDrawer Assignment History must EntityLink previous/new drivers
 * (Exact Leaves load.drawer.assignment_history:reverse_link / driver).
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
const MATRIX = "docs/specs/scoreboard/modules/dispatch.required.json";
const SELF = "scripts/verify-load-drawer-assignment-history-driver-entitylinks.mjs";
const HEADER = '/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leaves":["load.drawer.assignment_history"],"task":"DISP-F5860-ASSIGNMENT-HISTORY-REVERSE-EXACT-LEAF","vertical":"column-wave"} */';

function audit(src, matrix, self) {
  const failures = [];
  if (!/EntityLinkOrTombstone/.test(src)) failures.push(`${TARGET}: must use EntityLinkOrTombstone`);
  if (!/data-testid=["']load-drawer-assignment-prev-driver-link["']/.test(src)) failures.push(`${TARGET}: missing previous-driver drill`);
  if (!/data-testid=["']load-drawer-assignment-new-driver-link["']/.test(src)) failures.push(`${TARGET}: missing new-driver drill`);
  if (!/data-testid=["']load-drawer-assignment-history-driver-links["']/.test(src)) failures.push(`${TARGET}: missing assignment-history driver strip`);
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
  const matrix = fs.readFileSync(path.join(ROOT, MATRIX), "utf8");
  const self = fs.readFileSync(path.join(ROOT, SELF), "utf8");
  if (audit(src, matrix, self).length) throw new Error(`${LABEL}: live files must pass`);
  const plants = [
    ["previous driver", src.replace('data-testid="load-drawer-assignment-prev-driver-link"', 'data-testid="removed-prev-driver"'), matrix, self],
    ["new driver", src.replace('data-testid="load-drawer-assignment-new-driver-link"', 'data-testid="removed-new-driver"'), matrix, self],
    ["driver strip", src.replace('data-testid="load-drawer-assignment-history-driver-links"', 'data-testid="removed-driver-strip"'), matrix, self],
    ["Required", src, matrix.replace('"id": "load.drawer.assignment_history"', '"id": "load.drawer.assignment_history.removed"'), self],
    ["header", src, matrix, self.replace('"leaves":["load.drawer.assignment_history"]', '"leaves":["load.drawer.pre_settlement"]')],
  ];
  for (const [name, nextSrc, nextMatrix, nextSelf] of plants) {
    if (!audit(nextSrc, nextMatrix, nextSelf).length) throw new Error(`${LABEL}: planted ${name} defect escaped`);
  }
  console.log(`${LABEL}: OK — selftest 5/5 in-memory defects rejected`);
}

const mode = process.argv.includes("--selftest") ? "selftest" : "check";
try {
  if (mode === "selftest") selftest();
  else {
    const failures = audit(
      fs.readFileSync(path.join(ROOT, TARGET), "utf8"),
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
