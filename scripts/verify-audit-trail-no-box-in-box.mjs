#!/usr/bin/env node
/**
 * verify-audit-trail-no-box-in-box.mjs
 * Audit Trail page must use one outer section frame with a flat border-b filter row —
 * ParityTable is the table chrome; no nested bordered card wrapping it (CLS-BOX-IN-BOX).
 *
 * --selftest exercises pass + nested-wrapper failure fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/audit/AuditTrailPage.tsx";
const LABEL = "verify-audit-trail-no-box-in-box";
const FRAME_MARKER = 'data-testid="audit-trail-list-frame"';
const TABLE_MARKER = 'tableTestId="audit-trail-table"';
const NESTED_WRAPPER_RE =
  /<div className="[^"]*(?:overflow-hidden )?rounded-(?:lg|md|sm) border border-gray-200 bg-white[^"]*"[\s\S]*?<ParityTable/g;

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

/** @param {string} src full page source */
export function listFrameRegion(src) {
  const body = stripComments(src);
  const start = body.indexOf(FRAME_MARKER);
  if (start < 0) return "";
  const open = body.lastIndexOf("<section", start);
  const close = body.indexOf("</section>", start);
  if (open < 0 || close < 0) return body.slice(open >= 0 ? open : start);
  return body.slice(open, close + "</section>".length);
}

/** @param {string} region section frame JSX slice */
export function collectProblems(region) {
  const problems = [];
  if (!region.includes(FRAME_MARKER)) {
    problems.push(`${TARGET}: missing audit-trail-list-frame section wrapper`);
    return problems;
  }
  if (!region.includes(TABLE_MARKER)) {
    problems.push(`${TARGET}: missing audit-trail ParityTable marker`);
    return problems;
  }
  if (!/border-b border-gray-200/.test(region)) {
    problems.push(`${TARGET}: filter row must use border-b only (no separate filter card)`);
  }
  if (NESTED_WRAPPER_RE.test(region)) {
    problems.push(
      `${TARGET}: ParityTable is wrapped in a nested bordered card — remove the inner box; ParityTable is the single table frame`,
    );
  }
  const sectionOpens = (region.match(/<section/g) ?? []).length;
  if (sectionOpens > 1) {
    problems.push(`${TARGET}: must not nest multiple section frames (box-in-box)`);
  }
  return problems;
}

function selftest() {
  const good = `
    <section className="overflow-hidden rounded-sm border border-gray-200 bg-white" data-testid="audit-trail-list-frame">
      <div className="grid gap-3 border-b border-gray-200 bg-gray-50 p-4">
        <button className="rounded-sm bg-[#1f2a44] px-3 py-1.5 text-white">Apply</button>
      </div>
      <ParityTable tableTestId="audit-trail-table" />
    </section>`;

  const badNested = `
    <section className="overflow-hidden rounded-sm border border-gray-200 bg-white" data-testid="audit-trail-list-frame">
      <div className="rounded-sm border border-gray-200 bg-white p-4">filters</div>
      <div className="overflow-hidden rounded-sm border border-gray-200 bg-white p-2">
        <ParityTable tableTestId="audit-trail-table" />
      </div>
    </section>`;

  const cases = [
    { name: "flat section + direct ParityTable → 0 errors", region: good, want: 0 },
    { name: "nested bordered wrapper around ParityTable → fail", region: badNested, wantMin: 1 },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = collectProblems(c.region).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.wantMin;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}  (errors=${n})`);
  }
  if (failed) {
    console.error(`\n[${LABEL}] SELFTEST FAILED: ${failed}`);
    process.exit(1);
  }
  console.log(`\n[${LABEL}] SELFTEST PASS`);
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

if (IS_MAIN) {
  const full = path.join(ROOT, TARGET);
  if (!fs.existsSync(full)) {
    console.error(`[${LABEL}] FAIL: ${TARGET} missing`);
    process.exit(1);
  }
  const src = fs.readFileSync(full, "utf8");
  const problems = collectProblems(listFrameRegion(src));
  if (problems.length) {
    console.error(`[${LABEL}] FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — Audit Trail list is a flat section frame (no box-in-box)`);
}
