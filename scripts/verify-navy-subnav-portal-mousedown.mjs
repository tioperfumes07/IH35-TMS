#!/usr/bin/env node
/**
 * NavyPageSubNav portaled menu: outside-mousedown must treat menuRef as inside,
 * and the menu must clear the hide timer on mouseenter (Codex QA ROUND 7.6 11-02).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-navy-subnav-portal-mousedown";
const SRC = "apps/frontend/src/components/layout/NavyPageSubNav.tsx";
const TEST = "apps/frontend/src/components/layout/NavyPageSubNav.test.tsx";

function audit(src, testSrc) {
  const fails = [];
  if (!/menuRef\.current\?\.contains\(t\)/.test(src) && !/menuRef\.current\?\.contains\(/.test(src)) {
    fails.push(`${SRC}: outside-mousedown must include menuRef.contains`);
  }
  if (!/onMouseEnter=\{show\}/.test(src) || !/onMouseLeave=\{scheduleHide\}/.test(src)) {
    fails.push(`${SRC}: portaled menu must wire onMouseEnter={show} + onMouseLeave={scheduleHide}`);
  }
  if (!testSrc.includes("navigates when a child menuitem is clicked")) {
    fails.push(`${TEST}: must assert real child navigation (not href-only)`);
  }
  if (!testSrc.includes("keeps the menu open when mousedown lands on a portaled menuitem")) {
    fails.push(`${TEST}: must assert portal mousedown does not close`);
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const goodSrc = `
if (wrapperRef.current?.contains(t)) return;
if (menuRef.current?.contains(t)) return;
onMouseEnter={show}
onMouseLeave={scheduleHide}
`;
  const goodTest = `
it("navigates when a child menuitem is clicked (portal mousedown must not cancel)", async () => {});
it("keeps the menu open when mousedown lands on a portaled menuitem", async () => {});
`;
  if (audit(goodSrc, goodTest).length) throw new Error("SELFTEST FAIL clean");
  const bad = goodSrc.replace("menuRef.current?.contains(t)", "false");
  if (audit(bad, goodTest).length === 0) throw new Error("SELFTEST FAIL: missing menuRef undetected");
  console.log(`${LABEL}: SELFTEST PASS`);
  process.exit(0);
}

const fails = audit(
  fs.readFileSync(path.join(ROOT, SRC), "utf8"),
  fs.readFileSync(path.join(ROOT, TEST), "utf8"),
);
if (fails.length) {
  console.error(`${LABEL} FAILED:`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — portaled menu inside-hit + hover keep-open + navigation tests`);
