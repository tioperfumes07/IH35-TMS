#!/usr/bin/env node
// verify-lane-ownership.mjs — fails a PR that touches another seat's lane.
// Ruled 2026-09-22 after CC-1 and CC-3 both wrote settlement rows 5805/5806 in the same hour.
//
// Seat identity, in order of precedence:
//   1. env SEAT           (CC-1 | CC-2 | CC-3)
//   2. branch name prefix (cc-1/..., cc1/..., claude-coder-1/...)
// No seat resolved -> FAIL. Never assume a lane.
//
// Lane cross: put `LANE-CROSS: <ruling-filename>` in the PR body AND pass
// LANE_CROSS=<ruling-filename> to this script. The ruling file must exist in docs/bus/.
//
// @independent-input git-diff:BASE...HEAD -- this guard's real evidence is the LIVE, dynamic
// changed-file list for the current branch (execSync git diff below), cross-referenced against
// the static docs/bus/LANES.md map. The literal-path regex in verify-no-closed-loop-guards.mjs
// only sees the LANES_FILE constant, misreading this as a single-source declaration ratchet; it
// is not one — the git diff is an independent, live process-state input, not the same artifact
// the guard is trying to prove.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const LANES_FILE = 'docs/bus/LANES.md';
const BASE = process.env.LANE_BASE || 'origin/main';

const fail = (m) => { console.error(`\n  LANE GUARD FAIL: ${m}\n`); process.exit(1); };
const ok   = (m) => console.log(`  LANE GUARD PASS: ${m}`);

if (!existsSync(LANES_FILE)) fail(`${LANES_FILE} is missing. The lane table IS the rule; without it nothing is enforced.`);

// ---- resolve seat -----------------------------------------------------------
let seat = (process.env.SEAT || '').trim().toUpperCase();
if (!seat) {
  let branch = '';
  try { branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim(); } catch {}
  const m = branch.toLowerCase().match(/^(?:claude-)?(?:coder-)?cc-?([123])\b/);
  if (m) seat = `CC-${m[1]}`;
  // LEAD: scripts/claim-verify-step.mjs's own SEATS table already defines a `lead` seat in the
  // odd1 band with branch prefix `claude/`. This guard recognised only CC-1/2/3, so a legally
  // claimed Lead branch could never be pushed — the two files disagreed about who exists.
  // Ruling: docs/bus/09-22-2026-LEAD-RULING-LEAD-SEAT-AND-CI-WORKFLOW-LANE.md
  else if (/^claude\//.test(branch.toLowerCase())) seat = 'LEAD';
  // CURSOR: LEAD RULING — CURSOR SEAT AND LANE, ROUND 48, 2026-09-22. Cursor's real branch
  // prefix is `cursor/` (confirmed live: 7 finished commits stuck at dd14103af9 on
  // cursor/r46-items-1-10, and a later 5-commit branch at 1f61772644, both unable to push
  // because this guard recognised no CURSOR seat at all -- every push 03b-rejected regardless
  // of lane content). This guard was the bottleneck, not Cursor's work.
  else if (/^cursor\//.test(branch.toLowerCase())) seat = 'CURSOR';
}
if (!/^(CC-[123]|LEAD|CURSOR)$/.test(seat)) {
  fail(`could not resolve the seat. Set SEAT=CC-1|CC-2|CC-3|LEAD|CURSOR, or name the branch ` +
       `cc-1/<topic> (seat), claude/<topic> (Lead), or cursor/<topic> (Cursor). ` +
       `A PR with no owner is exactly how two seats wrote the same rows.`);
}

// ---- parse LANES.md ---------------------------------------------------------
// Sections are "## CC-N ..." / "## SHARED ..." / "## FORBIDDEN ...".
// Path globs are the lines that are not TABLES:/prose.
const text = readFileSync(LANES_FILE, 'utf8');
const sections = {};
let cur = null;
for (const raw of text.split('\n')) {
  const h = raw.match(/^##\s+(CC-[123]|LEAD|CURSOR|SHARED|FORBIDDEN)/);
  if (h) { cur = h[1]; sections[cur] = []; continue; }
  if (!cur) continue;
  const line = raw.trim();
  if (!line || line.startsWith('TABLES:') || line.startsWith('#')) continue;
  if (/^[A-Za-z].*:/.test(line) && !line.includes('/')) continue;   // prose like "Any write to: ..."
  if (line.includes('/') || line.includes('*')) sections[cur].push(line.split(/\s{2,}/)[0].trim());
}

// ---- guard on the guard -----------------------------------------------------
// A CURSOR-seat bug (2026-09-22, same round as the seat landing itself) proved this file's own
// parser is not just naive but actively dangerous: prose inside a lane section that happens to
// contain "/" or "*" (e.g. an em-dash-joined sentence naming a path) silently compiles into a real
// glob and grants a lane nobody wrote. Every parsed entry must look like an actual path pattern --
// no whitespace, no em/en-dash, no sentence-ending punctuation -- or this guard is worse than none,
// because it reads as coverage while quietly widening a seat's real access.
const PATH_LIKE = /^[A-Za-z0-9_.*/-]+$/;
for (const [section, globs] of Object.entries(sections)) {
  for (const g of globs) {
    if (!PATH_LIKE.test(g)) {
      fail(
        `${LANES_FILE} section "## ${section}" parsed a non-path line as a lane glob: "${g}". ` +
        `This is prose being silently compiled into a permission grant -- move it below the TABLES: ` +
        `line or prefix it with "# " (the parser skips both). Refusing to trust any lane in this file ` +
        `until every entry looks like a real path.`
      );
    }
  }
}

for (const s of ['CC-1', 'CC-2', 'CC-3', 'SHARED']) {
  if (!sections[s]?.length) fail(`${LANES_FILE} has no path patterns under "## ${s}". Refusing to run a guard that would pass everything.`);
}

// glob -> regex.  ** = any depth, * = within one segment.
const rx = (g) => new RegExp('^' + g
  .replace(/[.+^${}()|[\]\\]/g, '\\$&')
  .replace(/\*\*/g, '\u0000')
  .replace(/\*/g, '[^/]*')
  .replace(/\u0000/g, '.*') + '($|/)');

const matches = (file, globs) => globs.some((g) => rx(g).test(file));

// ---- changed files ----------------------------------------------------------
let files = [];
try {
  const mergeBase = execSync(`git merge-base ${BASE} HEAD`, { encoding: 'utf8' }).trim();
  files = execSync(`git diff --name-only ${mergeBase}..HEAD`, { encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean);
} catch (e) {
  fail(`could not diff against ${BASE} (${e.message}). Fetch the base branch first. ` +
       `A guard that cannot see the diff must never pass.`);
}
if (files.length === 0) { ok(`${seat}: no changed files.`); process.exit(0); }

// ---- lane cross -------------------------------------------------------------
const cross = (process.env.LANE_CROSS || '').trim();
let crossOk = false;
if (cross) {
  const p = cross.includes('/') ? cross : `docs/bus/${cross}`;
  if (!existsSync(p)) fail(`LANE_CROSS names "${cross}" but ${p} does not exist. A ruling you cannot open is not a ruling.`);
  crossOk = true;
  console.log(`  lane cross authorised by ${p}`);
}

// ---- verdict ----------------------------------------------------------------
const mine = sections[seat] ?? [];
const others = ['CC-1', 'CC-2', 'CC-3', 'LEAD', 'CURSOR'].filter((s) => s !== seat && sections[s]?.length);
const violations = [];
const forbidden = [];

for (const f of files) {
  if (matches(f, sections.FORBIDDEN || [])) { forbidden.push(f); continue; }
  if (matches(f, mine) || matches(f, sections.SHARED)) continue;
  const owner = others.find((s) => matches(f, sections[s]));
  violations.push({ file: f, owner: owner || 'UNASSIGNED' });
}

if (forbidden.length) {
  fail(`${forbidden.length} file(s) in the FORBIDDEN list. No ruling overrides this:\n` +
       forbidden.map((f) => `    ${f}`).join('\n'));
}

if (violations.length && !crossOk) {
  fail(`${seat} touched ${violations.length} file(s) outside its lane:\n` +
       violations.map((v) => `    ${v.file}   -> owned by ${v.owner}`).join('\n') +
       `\n\n  To cross: post to that seat's OUTBOX, get the Lead's written ruling into docs/bus/,` +
       `\n  then re-run with LANE_CROSS=<ruling-filename> and the same line in the PR body.`);
}

if (violations.length && crossOk) {
  console.log(`  ${violations.length} out-of-lane file(s), authorised:`);
  for (const v of violations) console.log(`    ${v.file}   -> ${v.owner}`);
}

ok(`${seat}: ${files.length} changed file(s), all in lane.`);
