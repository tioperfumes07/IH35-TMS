#!/usr/bin/env node
/**
 * CUST-CHROME-03 / GUARD row 224 — ParityTable resize handle must be VISIBLE at rest
 * (QBO-style column grip), not a transparent 6px hover-only strip.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/components/parity/ParityTable.tsx";
const LABEL = "verify-parity-table-resize-at-rest-visible";

function readSrc() {
  return fs.readFileSync(path.join(ROOT, FILE), "utf8");
}

export function collectProblems(src = readSrc()) {
  const problems = [];
  const sepStart = src.indexOf('role="separator"');
  const sepBlock = sepStart >= 0 ? src.slice(sepStart, sepStart + 900) : "";
  if (!sepBlock) {
    problems.push(`${FILE}: resize handle (role="separator") not found`);
    return problems;
  }

  if (/bg-transparent/.test(sepBlock)) {
    problems.push("resize handle must not use bg-transparent (invisible at rest)");
  }

  // Strip hover:/focus: variants so we require a base bg-* at rest.
  const atRest = sepBlock
    .replace(/hover:bg-[\w./\[\]%-]+/g, "")
    .replace(/focus:bg-[\w./\[\]%-]+/g, "")
    .replace(/focus-visible:bg-[\w./\[\]%-]+/g, "");

  if (!/\bbg-[\w./\[\]%-]+/.test(atRest)) {
    problems.push("resize handle needs a non-hover/focus bg-* class (visible at rest)");
  }

  // Hover-only regression: className with hover:bg but no base bg.
  const classMatch = sepBlock.match(/className="([^"]+)"/);
  if (classMatch) {
    const cls = classMatch[1];
    const hasHoverBg = /hover:bg-/.test(cls);
    const hasBaseBg = cls
      .split(/\s+/)
      .some((t) => /^bg-/.test(t) && !/^hover:/.test(t) && !/^focus/.test(t));
    if (hasHoverBg && !hasBaseBg) {
      problems.push("resize handle is hover-only (hover:bg without base bg-*) — row 224 defect");
    }
  }

  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const real = readSrc();
  const broken = real.replace(
    /className="absolute right-0 top-0 h-full w-1\.5[^"]*"/,
    'className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-gray-300 focus:bg-gray-400 focus:outline-hidden"'
  );
  if (collectProblems(broken).length === 0) {
    console.error(`${LABEL} --selftest FAIL: pre-fix hover-only handle not flagged`);
    process.exit(1);
  }
  const good = collectProblems(real);
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL:\n${good.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

if (IS_MAIN) {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL}: FAIL\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — ParityTable resize handle visible at rest`);
}
