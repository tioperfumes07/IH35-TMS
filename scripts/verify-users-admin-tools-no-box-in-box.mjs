#!/usr/bin/env node
/**
 * verify-users-admin-tools-no-box-in-box.mjs
 * Users owner-only Admin Tools strip must use a single outer section frame with a flat action row —
 * no nested bordered card inside the outer bordered container (Cascade row 207 / ORPH-004).
 *
 * --selftest exercises pass + nested-tile failure fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/Users.tsx";
const LABEL = "verify-users-admin-tools-no-box-in-box";
const ADMIN_TOOLS_MARKER = "Admin Tools";
const NESTED_BORDER_RE = /className="[^"]*rounded-(?:sm|md)[^"]*border border-slate-200[^"]*bg-white[^"]*"/g;

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

/** @param {string} src full page source */
export function adminToolsSection(src) {
  const body = stripComments(src);
  const marker = body.indexOf(ADMIN_TOOLS_MARKER);
  if (marker < 0) return "";
  const sectionStart = body.lastIndexOf("<section", marker);
  const slice = body.slice(sectionStart >= 0 ? sectionStart : marker);
  const end = slice.indexOf(") : null}");
  return end >= 0 ? slice.slice(0, end + ") : null}".length) : slice;
}

/** @param {string} section Admin Tools JSX slice */
export function collectProblems(section) {
  const problems = [];
  if (!section.includes(ADMIN_TOOLS_MARKER)) {
    problems.push(`${TARGET}: missing Admin Tools owner strip`);
    return problems;
  }
  if (!/\<section className="[^"]*overflow-hidden rounded-sm border border-slate-200 bg-white[^"]*"\>/.test(section)) {
    problems.push(`${TARGET}: Admin Tools root must be a single overflow-hidden section frame`);
  }
  if (!/border-b border-slate-200 bg-slate-50/.test(section)) {
    problems.push(`${TARGET}: Admin Tools header must use border-b on the outer section (no inner card)`);
  }
  const nested = section.match(NESTED_BORDER_RE) ?? [];
  const innerNested = nested.filter(
    (m) => !m.includes("overflow-hidden rounded-sm border border-slate-200 bg-white"),
  );
  if (innerNested.length > 0) {
    problems.push(
      `${TARGET}: Admin Tools nests ${innerNested.length} inner bordered white card(s) — flatten to one section frame`,
    );
  }
  if (/rounded-md border border-slate-200 bg-slate-50 p-4/.test(section)) {
    problems.push(`${TARGET}: Admin Tools must not use outer gray padded card wrapping an inner white card`);
  }
  return problems;
}

function selftest() {
  const good = `
          <section className="mt-6 overflow-hidden rounded-sm border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h3>Admin Tools</h3>
            </div>
            <div className="flex items-start justify-between gap-4 px-4 py-3">Run probe</div>
          </section>`;

  const badNested = `
          <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4">
            <h3>Admin Tools</h3>
            <div className="rounded-sm border border-slate-200 bg-white p-3">Run probe</div>
          </div>`;

  const cases = [
    { name: "flat section + border-b header → 0 errors", section: good, want: 0 },
    { name: "nested rounded border white card → fail", section: badNested, wantMin: 1 },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = collectProblems(c.section).length;
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

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const filePath = path.join(ROOT, TARGET);
  if (!fs.existsSync(filePath)) {
    console.error(`[${LABEL}] FAILED — missing ${TARGET}`);
    process.exit(1);
  }
  const src = fs.readFileSync(filePath, "utf8");
  const problems = collectProblems(adminToolsSection(src));
  if (problems.length) {
    console.error(`[${LABEL}] FAILED — ${problems.length} issue(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — Users Admin Tools is a flat section frame (no box-in-box).`);
}
