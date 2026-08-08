#!/usr/bin/env node
/**
 * PROG-CLS-MODULE-MATRIX — Program scoreboard unfinished board must be
 * individual CLS columns (~31 from wave-queue) × module rows (~26 sidebar),
 * live from request-time queue, green only when drained AND guard file on disk.
 *
 * Owner 2026-08-08: #4780 TRANSP×13 + USMCA×13 is the WRONG axis. Claimed step 2842.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const BACKEND = "apps/backend/src/program/audit-scoreboard.routes.ts";
const PAGE = "apps/frontend/src/pages/program/AuditScoreboardPage.tsx";
const LABEL = "verify-class-scoreboard-individual-columns";

function maskComments(src) {
  const out = Array.from(src);
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (quote) {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      quote = c;
      i++;
      continue;
    }
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") {
        out[i] = " ";
        i++;
      }
      continue;
    }
    if (c === "/" && n === "*") {
      const e = src.indexOf("*/", i + 2);
      const stop = e === -1 ? src.length : e + 2;
      for (let k = i; k < stop; k++) if (out[k] !== "\n") out[k] = " ";
      i = stop;
      continue;
    }
    i++;
  }
  return out.join("");
}

export function auditBackend(raw) {
  const src = maskComments(raw);
  const problems = [];
  if (!/\bfunction\s+buildClassModuleMatrix\s*\(/.test(src) && !/\bbuildClassModuleMatrix\s*=/.test(src)) {
    problems.push(`${BACKEND}: missing buildClassModuleMatrix — no module×CLS matrix builder.`);
  }
  if (!/\bfunction\s+classCellVerified\s*\(/.test(src) && !/\bclassCellVerified\s*=/.test(src)) {
    problems.push(`${BACKEND}: missing classCellVerified — drained cells must require guard file on disk.`);
  }
  if (!/\bPROGRAM_MATRIX_MODULE_IDS\b/.test(src)) {
    problems.push(`${BACKEND}: missing PROGRAM_MATRIX_MODULE_IDS (26 module rows).`);
  }
  if (!/\bmatrix\s*[,:}]/.test(src)) {
    problems.push(`${BACKEND}: classScoreboard payload must include matrix.`);
  }
  if (!/\bguardMissing\b/.test(src)) {
    problems.push(`${BACKEND}: drained-without-guard must surface guardMissing (no false green).`);
  }
  // Must not be the only unfinished chrome story as entity×13.
  if (/\bTRANSP\s*×\s*13\b/.test(raw) && !/\bbuildClassModuleMatrix\b/.test(src)) {
    problems.push(`${BACKEND}: entity×13 without module×CLS matrix is the #4780 wrong axis.`);
  }
  return problems;
}

export function auditPage(raw) {
  const src = maskComments(raw);
  const problems = [];
  if (!/\bclassMatrix\b/.test(src)) {
    problems.push(`${PAGE}: does not bind classMatrix from live classScoreboard.matrix.`);
  }
  if (!/class-scoreboard-columns/.test(src)) {
    problems.push(`${PAGE}: missing data-testid class-scoreboard-columns (module×CLS table).`);
  }
  if (!/Individual issues × modules/.test(raw) && !/module rows ×/.test(raw)) {
    problems.push(`${PAGE}: must label the unfinished board as module × CLS columns (owner axis).`);
  }
  if (!/class-scoreboard-matrix-missing/.test(src)) {
    problems.push(`${PAGE}: must warn when matrix is missing (no invented cells).`);
  }
  if (!/class-scoreboard-guard-warning/.test(src)) {
    problems.push(`${PAGE}: must warn when drainedWithoutGuard > 0.`);
  }
  return problems;
}

function main() {
  const bePath = join(ROOT, BACKEND);
  const pagePath = join(ROOT, PAGE);
  if (!existsSync(bePath) || !existsSync(pagePath)) {
    console.error(`${LABEL}: FAIL missing source`);
    process.exit(1);
  }
  const be = readFileSync(bePath, "utf8");
  const page = readFileSync(pagePath, "utf8");
  const problems = [...auditBackend(be), ...auditPage(page)];
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — module×CLS matrix + guardMissing honesty wired`);
}

if (process.argv.includes("--selftest")) {
  const be = readFileSync(join(ROOT, BACKEND), "utf8");
  const page = readFileSync(join(ROOT, PAGE), "utf8");
  // Mutation: erase matrix symbols → must FAIL
  const brokenBe = be
    .replace(/buildClassModuleMatrix/g, "buildClassModuleMatrixX")
    .replace(/classCellVerified/g, "classCellVerifiedX")
    .replace(/PROGRAM_MATRIX_MODULE_IDS/g, "PROGRAM_MATRIX_MODULE_IDS_X")
    .replace(/\bmatrix\s*:/g, "matrixX:");
  const brokenPage = page
    .replace(/class-scoreboard-columns/g, "class-scoreboard-columns-GONE")
    .replace(/classMatrix/g, "classMatrixX")
    .replace(/class-scoreboard-matrix-missing/g, "gone")
    .replace(/class-scoreboard-guard-warning/g, "gone2")
    .replace(/Individual issues × modules/g, "gone title")
    .replace(/module rows ×/g, "gone sub");
  const failBe = auditBackend(brokenBe);
  const failPage = auditPage(brokenPage);
  if (failBe.length === 0 || failPage.length === 0) {
    console.error(`${LABEL}: --selftest FAIL — mutations did not redden (be=${failBe.length} page=${failPage.length})`);
    process.exit(1);
  }
  if (auditBackend(be).length || auditPage(page).length) {
    console.error(`${LABEL}: --selftest FAIL — clean sources not green`);
    process.exit(1);
  }
  console.log(`${LABEL}: --selftest PASS`);
  process.exit(0);
}

main();
