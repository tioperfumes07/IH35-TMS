#!/usr/bin/env node
/**
 * verify-users-create-no-box-in-box.mjs
 * Users Create User drawer — Password setup radios must use flat border-t spacing inside drawer
 * chrome (no nested rounded-sm border tile under the drawer frame).
 *
 * --selftest exercises pass + nested-tile failure fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/Users.tsx";
const LABEL = "verify-users-create-no-box-in-box";
const NESTED_TILE_RE = /className="[^"]*rounded-sm border border-gray-200[^"]*"/g;

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

/** @param {string} src full page source */
export function createUserDrawerSection(src) {
  const body = stripComments(src);
  const start = body.indexOf('title="Create User"');
  if (start < 0) return "";
  const end = body.indexOf("</Modal>", start);
  if (end < 0) return body.slice(start);
  return body.slice(start, end);
}

/** @param {string} section Create User drawer JSX slice */
export function collectProblems(section) {
  const problems = [];
  if (!section.includes('title="Create User"')) {
    problems.push(`${TARGET}: Create User drawer must exist`);
  }
  const pwdSetup = section.match(/Password setup[\s\S]{0,800}/)?.[0] ?? "";
  if (!pwdSetup) {
    problems.push(`${TARGET}: Password setup field group missing in Create User drawer`);
    return problems;
  }
  if (/rounded-sm border border-gray-200 p-2/.test(pwdSetup)) {
    problems.push(
      `${TARGET}: Password setup radio group nests a bordered tile — use border-t rows only`,
    );
  }
  if (!/border-t border-gray-200/.test(pwdSetup)) {
    problems.push(`${TARGET}: Password setup radios must flatten with border-t border-gray-200 pt-2`);
  }
  if (!/name="password-setup-mode"/.test(pwdSetup)) {
    problems.push(`${TARGET}: password-setup-mode radios must remain wired for invite vs set-password`);
  }
  if (!/send_invite/.test(pwdSetup) || !/set_password/.test(pwdSetup)) {
    problems.push(`${TARGET}: both send_invite and set_password provision modes must remain`);
  }
  const nested = pwdSetup.match(NESTED_TILE_RE) ?? [];
  if (nested.length > 0) {
    problems.push(
      `${TARGET}: Password setup section nests ${nested.length} bordered tile(s) — drawer chrome is the only frame`,
    );
  }
  return problems;
}

function selftest() {
  const good = `
    title="Create User"
    <label>Password setup</label>
    <div className="space-y-2 border-t border-gray-200 pt-2 text-xs text-gray-700">
      <input type="radio" name="password-setup-mode" checked={provisionMode === "send_invite"} />
      <input type="radio" name="password-setup-mode" checked={provisionMode === "set_password"} />
    </div>`;

  const badNested = `
    title="Create User"
    <label>Password setup</label>
    <div className="space-y-2 rounded-sm border border-gray-200 p-2 text-xs text-gray-700">
      <input type="radio" name="password-setup-mode" />
    </div>`;

  const cases = [
    { name: "flat border-t radios → 0 errors", section: good, want: 0 },
    { name: "nested rounded-sm border tile → fail", section: badNested, wantMin: 1 },
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

const filePath = path.join(ROOT, TARGET);
if (!fs.existsSync(filePath)) {
  console.error(`[${LABEL}] FAILED — missing ${TARGET}`);
  process.exit(1);
}
const src = fs.readFileSync(filePath, "utf8");
const problems = collectProblems(createUserDrawerSection(src));
if (problems.length) {
  console.error(`[${LABEL}] FAILED — ${problems.length} issue(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — Create User drawer Password setup uses flat border-t rows (no box-in-box).`);
