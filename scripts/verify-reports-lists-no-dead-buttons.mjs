#!/usr/bin/env node
// B-2 guard: verify no permanently disabled <Button> elements (dead controls) in Lists/Reports pages.
// A bare `disabled` attribute (not `disabled={expr}`) on a <Button> is always disabled — a dead control.
// EXEMPTION: a disabled button with BOTH title= and aria-disabled="true" is "honest-disabled" —
// it communicates why it's disabled and is enforced by verify-fuel-recon-manual-match-honest.mjs.
// Such buttons are not flagged.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SKIP_RE = /(\/__tests__\/|\.test\.(tsx|ts)$|\.deprecated\.)/;
const SCAN_DIRS = [
  path.join(ROOT, "apps/frontend/src/pages/lists"),
  path.join(ROOT, "apps/frontend/src/pages/reports"),
];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (/\.tsx$/.test(entry.name) && !SKIP_RE.test(p.replace(/\\/g, "/"))) out.push(p);
  }
  return out;
}

/** Pure: the dead-button violations of one file's source (relPath only labels the finding). */
export function findDeadButtons(relPath, src) {
  const out = [];
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Flag bare `disabled` attribute on <Button (not disabled={...} which is conditional)
    if (/<Button\b/.test(line) && /\bdisabled\b/.test(line) && !/disabled=\{/.test(line)) {
      // Exempt "honest-disabled": has both title= and aria-disabled="true"
      const chunk = lines.slice(i, Math.min(i + 8, lines.length)).join("\n");
      const isHonestDisabled = /\btitle\s*=/.test(chunk) && /aria-disabled="true"/.test(chunk);
      if (!isHonestDisabled) {
        out.push(
          `${relPath}:${i + 1} permanently disabled <Button> (dead control, no honest title+aria-disabled): ${line.trim().slice(0, 100)}`
        );
      }
    }
  }
  return out;
}

function runSelftest() {
  const cases = [
    ["a conditional disabled={expr} Button passes", findDeadButtons("x.tsx", `<Button disabled={busy}>Save</Button>`).length === 0],
    ["a Button with no disabled passes", findDeadButtons("x.tsx", `<Button onClick={go}>Go</Button>`).length === 0],
    ["an honest-disabled Button (title + aria-disabled) passes", findDeadButtons("x.tsx", `<Button disabled title="Needs a match first" aria-disabled="true">Match</Button>`).length === 0],
    ["a bare disabled Button is flagged", findDeadButtons("x.tsx", `<Button disabled>Export</Button>`).length === 1],
    ["disabled with title but no aria-disabled is flagged", findDeadButtons("x.tsx", `<Button disabled title="why">Export</Button>`).length === 1],
    ["disabled with aria-disabled but no title is flagged", findDeadButtons("x.tsx", `<Button disabled aria-disabled="true">Export</Button>`).length === 1],
  ];
  for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, ok]) => !ok).length;
  console.log(bad ? "verify-reports-lists-no-dead-buttons --selftest FAIL" : `verify-reports-lists-no-dead-buttons --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

if (process.argv.includes("--selftest")) runSelftest();

const violations = [];

for (const dir of SCAN_DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const file of walk(dir)) {
    violations.push(...findDeadButtons(path.relative(ROOT, file), fs.readFileSync(file, "utf8")));
  }
}

if (violations.length > 0) {
  console.error(`FAIL: ${violations.length} dead button(s) found in Lists/Reports pages:`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}

console.log("OK: no permanently disabled <Button> dead controls in Lists/Reports pages.");
process.exit(0);
