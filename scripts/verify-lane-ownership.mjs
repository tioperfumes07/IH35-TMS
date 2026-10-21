#!/usr/bin/env node
// verify-lane-ownership.mjs — fails a PR that touches another seat's lane.
// Ruled 2026-09-22 after CC-1 and CC-3 both wrote settlement rows 5805/5806 in the same hour.
//
// Seat identity, in order of precedence:
//   1. env SEAT           (CC-1 | CC-2 | CC-3)
//   2. branch name prefix (cc-1/..., cc1/..., claude-coder-1/...)
// No seat resolved -> FAIL. Never assume a lane.
//
// Lane cross (either one):
//   - a `SURFACE-BREACH-AUTHORIZED: <owning seat> <reason>` line in any commit body on the branch (BASE..HEAD) —
//     the SAME line verify-seat-surface-ownership.mjs accepts (LEAD 14:30Z: one cross-lane system, so CI needs no
//     local env). It authorizes only files whose LANES.md owner is the seat it names; UNASSIGNED only by a LEAD line (14:50Z); FORBIDDEN never.
//   - legacy: `LANE-CROSS: <ruling-filename>` in the PR body AND LANE_CROSS=<ruling-filename> passed to this script
//     (the ruling file must exist in docs/bus/).
//
// @independent-input git-diff:BASE...HEAD -- this guard's real evidence is the LIVE, dynamic
// changed-file list for the current branch (execSync git diff below), cross-referenced against
// the static docs/bus/LANES.md map. The literal-path regex in verify-no-closed-loop-guards.mjs
// only sees the LANES_FILE constant, misreading this as a single-source declaration ratchet; it
// is not one — the git diff is an independent, live process-state input, not the same artifact
// the guard is trying to prove.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { authorizedCanonicalSeats, canonicalSeat } from './lib/surface-breach-lines.mjs';

const LANES_FILE = 'docs/bus/LANES.md';
const BASE = process.env.LANE_BASE || 'origin/main';

const fail = (m) => { console.error(`\n  LANE GUARD FAIL: ${m}\n`); process.exit(1); };
const ok   = (m) => console.log(`  LANE GUARD PASS: ${m}`);

// ---- parse LANES.md ---------------------------------------------------------
// Sections are "## CC-N ..." / "## SHARED ..." / "## FORBIDDEN ...".
// Path globs are the lines that are not TABLES:/prose.
// Pure: returns { sections } or { error } so --selftest can plant a bad lane file in memory.
export function parseLanes(text) {
  const sections = {};
  let cur = null;
  for (const raw of text.split('\n')) {
    const h = raw.match(/^##\s+(CC-[123]|LEAD|CURSOR|CODEX|DEPENDABOT|SHARED|FORBIDDEN)/);
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
        return { error:
          `${LANES_FILE} section "## ${section}" parsed a non-path line as a lane glob: "${g}". ` +
          `This is prose being silently compiled into a permission grant -- move it below the TABLES: ` +
          `line or prefix it with "# " (the parser skips both). Refusing to trust any lane in this file ` +
          `until every entry looks like a real path.` };
      }
    }
  }

  for (const s of ['CC-1', 'CC-2', 'CC-3', 'SHARED']) {
    if (!sections[s]?.length) return { error: `${LANES_FILE} has no path patterns under "## ${s}". Refusing to run a guard that would pass everything.` };
  }
  return { sections };
}

// glob -> regex.  ** = any depth, * = within one segment.
const rx = (g) => new RegExp('^' + g
  .replace(/[.+^${}()|[\]\\]/g, '\\$&')
  .replace(/\*\*/g, '\u0000')
  .replace(/\*/g, '[^/]*')
  .replace(/\u0000/g, '.*') + '($|/)');

const matches = (file, globs) => globs.some((g) => rx(g).test(file));

/** Pure verdict: which changed files are FORBIDDEN, which sit outside `seat`'s lane. */
export function classifyFiles(files, seat, sections) {
  const mine = sections[seat] ?? [];
  const others = ['CC-1', 'CC-2', 'CC-3', 'LEAD', 'CURSOR', 'CODEX'].filter((s) => s !== seat && sections[s]?.length);
  const violations = [];
  const forbidden = [];
  // LEAD 22:25Z (443 dependabot lane): the bot seat owns ONLY its own lane — the SHARED grants (apps/frontend/**, docs/**,
  // scripts/ops/**) are for seats that declare their change in a PR body; a bot never does, so a dependabot branch
  // touching apps/** source fails exactly like any out-of-lane file.
  const shared = seat === 'DEPENDABOT' ? [] : (sections.SHARED || []);
  for (const f of files) {
    if (matches(f, sections.FORBIDDEN || [])) { forbidden.push(f); continue; }
    if (matches(f, mine) || matches(f, shared)) continue;
    const owner = others.find((s) => matches(f, sections[s]));
    violations.push({ file: f, owner: owner || 'UNASSIGNED' });
  }
  return { violations, forbidden };
}

/**
 * LEAD 14:30Z — a violation is authorized when a SURFACE-BREACH-AUTHORIZED line in the branch's commit bodies names
 * the file's OWNING seat. A line naming another seat authorizes nothing. LEAD 14:50Z: an UNASSIGNED file (no LANES.md
 * owner to name) is authorized only by a LEAD line (`SURFACE-BREACH-AUTHORIZED: LEAD <reason>`); a seat line never.
 */
export function authorizeViolations(violations, commitBody) {
  const seats = authorizedCanonicalSeats(commitBody);
  const authorized = [];
  const unauthorized = [];
  for (const v of violations) {
    const needed = v.owner === 'UNASSIGNED' ? 'LEAD' : canonicalSeat(v.owner);
    if (seats.has(needed)) authorized.push(v);
    else unauthorized.push(v);
  }
  return { authorized, unauthorized };
}

// ---- --selftest: plant each violation this guard exists to catch, in memory ----------------
if (process.argv.includes("--selftest")) {
  const LANES = [
    '## CC-1 money', 'TABLES: accounting.*', 'apps/backend/src/accounting/**',
    '## CC-2 guard', 'scripts/verify-*.mjs',
    '## CC-3 fe', 'apps/frontend/**',
    '## SHARED', 'docs/bus/**',
    '## FORBIDDEN', 'db/migrations/.ledger.json',
  ].join('\n');
  let caught = 0; let planted = 0;
  const expect = (label, cond) => { planted++; if (cond) caught++; else console.error(`  ESCAPED: ${label}`); };
  const clean = parseLanes(LANES);
  if (clean.error) { console.error(`verify-lane-ownership SELFTEST FAIL: clean lane file rejected: ${clean.error}`); process.exit(1); }
  const inLane = classifyFiles(['scripts/verify-x.mjs', 'docs/bus/LANES.md'], 'CC-2', clean.sections);
  if (inLane.violations.length || inLane.forbidden.length) { console.error('verify-lane-ownership SELFTEST FAIL: in-lane diff flagged'); process.exit(1); }
  const cross = classifyFiles(['apps/backend/src/accounting/void.service.ts'], 'CC-2', clean.sections);
  expect('CC-2 touching CC-1 file', cross.violations.length === 1 && cross.violations[0].owner === 'CC-1');
  const unassigned = classifyFiles(['infra/random.tf'], 'CC-2', clean.sections);
  expect('unassigned file', unassigned.violations[0]?.owner === 'UNASSIGNED');
  const forb = classifyFiles(['db/migrations/.ledger.json'], 'CC-1', clean.sections);
  expect('FORBIDDEN file', forb.forbidden.length === 1);
  expect('prose compiled into a glob', !!parseLanes(LANES.replace('apps/frontend/**', 'apps/frontend/** — and also whatever else')).error);
  expect('missing CC-2 section patterns', !!parseLanes(LANES.replace('scripts/verify-*.mjs', '')).error);
  expect('one-segment * does not span dirs', classifyFiles(['scripts/sub/verify-x.mjs'], 'CC-2', clean.sections).violations.length === 1);
  expect('detached CI PR checkout resolves the pushed branch', resolveBranchName('HEAD', { GITHUB_HEAD_REF: 'cc-3/x', GITHUB_REF_NAME: '26000/merge' }) === 'cc-3/x');
  expect('detached push checkout resolves GITHUB_REF_NAME', resolveBranchName('HEAD', { GITHUB_REF_NAME: 'cursor/y' }) === 'cursor/y');
  expect('a real local branch is never overridden by CI env', resolveBranchName('cc-1/z', { GITHUB_HEAD_REF: 'cc-3/x' }) === 'cc-1/z');
  expect('detached with no CI ref stays unresolved (seat check still fails)', resolveBranchName('HEAD', {}) === 'HEAD');
  // LEAD 22:25Z — the dependabot lane: manifests / lockfiles / workflows pass; app source never does (no SHARED grant).
  const BOT_LANES = parseLanes([
    '## CC-1 money', 'apps/backend/src/accounting/**', 'package*.json',
    '## CC-2 guard', 'scripts/verify-*.mjs',
    '## CC-3 fe', 'apps/backend/src/dispatch/**',
    '## DEPENDABOT', 'package*.json', 'apps/*/package*.json', '.github/workflows/**',
    '## SHARED', 'apps/frontend/**', '.github/workflows/**',
    '## FORBIDDEN', 'db/migrations/.ledger.json',
  ].join('\n'));
  expect('the bot lane file parses', !BOT_LANES.error);
  const botSections = BOT_LANES.sections ?? {};
  const bot = classifyFiles(['package-lock.json', 'apps/frontend/package.json', 'apps/driver-pwa/package-lock.json', '.github/workflows/codeql.yml'], 'DEPENDABOT', botSections);
  expect('a dependabot bump of manifests / lockfiles / workflows is in lane', bot.violations.length === 0 && bot.forbidden.length === 0);
  const botApp = classifyFiles(['package-lock.json', 'apps/frontend/src/main.tsx'], 'DEPENDABOT', botSections);
  expect('a dependabot branch touching apps/** source still FAILS', botApp.violations.some((v) => v.file === 'apps/frontend/src/main.tsx'));
  const botBackend = classifyFiles(['apps/backend/src/index.ts'], 'DEPENDABOT', botSections);
  expect('a dependabot branch touching backend source still FAILS', botBackend.violations.length === 1);
  expect('a CC seat keeps its SHARED grant (apps/frontend/**)', classifyFiles(['apps/frontend/src/main.tsx'], 'CC-2', botSections).violations.length === 0);
  expect('the real LANES.md carries the DEPENDABOT lane', (parseLanes(readFileSync(LANES_FILE, 'utf8')).sections?.DEPENDABOT ?? []).includes('package*.json'));
  // LEAD 14:30Z — SURFACE-BREACH-AUTHORIZED lines are the cross-lane authorization (one system with the surface guard).
  const withLine = authorizeViolations(cross.violations, 'FINDING: X\n\nSURFACE-BREACH-AUTHORIZED: CC-1 heavy CI peel (Lead ruling 13:45Z)');
  expect('cross-lane file + line naming its owner passes', withLine.unauthorized.length === 0 && withLine.authorized.length === 1);
  expect('cross-lane file without a line fails', authorizeViolations(cross.violations, 'FINDING: X\n\nno line here').unauthorized.length === 1);
  expect('a line naming ANOTHER seat does not authorize', authorizeViolations(cross.violations, 'SURFACE-BREACH-AUTHORIZED: CC-3 wrong seat').unauthorized.length === 1);
  expect('owner spelled cc1 / Cursor-case still matches its LANES.md seat', authorizeViolations([{ file: 'a', owner: 'CC-1' }, { file: 'b', owner: 'CURSOR' }], 'SURFACE-BREACH-AUTHORIZED: cc1 x\nSURFACE-BREACH-AUTHORIZED: Cursor y').unauthorized.length === 0);
  expect('an UNASSIGNED file is not authorized by an UNASSIGNED / seat line', authorizeViolations(unassigned.violations, 'SURFACE-BREACH-AUTHORIZED: UNASSIGNED x\nSURFACE-BREACH-AUTHORIZED: CC-1 y').unauthorized.length === 1);
  expect('an UNASSIGNED file IS authorized by a LEAD line (LEAD 14:50Z)', authorizeViolations(unassigned.violations, 'SURFACE-BREACH-AUTHORIZED: LEAD heavy CI peel').unauthorized.length === 0);
  expect('a LEAD line does not authorize a file another seat owns', authorizeViolations(cross.violations, 'SURFACE-BREACH-AUTHORIZED: LEAD x').unauthorized.length === 1);
  const forbWithLine = classifyFiles(['db/migrations/.ledger.json'], 'CC-2', clean.sections);
  expect('a FORBIDDEN file stays forbidden even with a line', forbWithLine.forbidden.length === 1 && forbWithLine.violations.length === 0);
  console.log(`verify-lane-ownership SELFTEST: ${caught}/${planted} planted violations caught`);
  process.exit(caught === planted ? 0 : 1);
}

if (!existsSync(LANES_FILE)) fail(`${LANES_FILE} is missing. The lane table IS the rule; without it nothing is enforced.`);
const parsed = parseLanes(readFileSync(LANES_FILE, 'utf8'));
if (parsed.error) fail(parsed.error);
const sections = parsed.sections;

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
// 443.102: a checkout with no changes against the base (main itself, a push-to-main CI run) has no
// diff to own, so there is no seat to name. Any branch WITH changes still must resolve its seat below.
if (files.length === 0) { ok('no changed files against ' + BASE + ' — nothing to own.'); process.exit(0); }

/** 443.102: the branch the seat pushed — the local name, or GitHub's ref when the checkout is detached. */
export function resolveBranchName(localBranch, env) {
  const b = (localBranch || '').trim();
  if (b && b !== 'HEAD') return b;
  return (env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME || b || '').trim();
}

// ---- resolve seat -----------------------------------------------------------
let seat = (process.env.SEAT || '').trim().toUpperCase();
if (!seat) {
  let branch = '';
  try { branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim(); } catch {}
  // 443.102: a CI checkout of a pull request is a DETACHED merge commit, so the local branch name reads
  // "HEAD" and the seat could never resolve there. GitHub names the real branch in GITHUB_HEAD_REF
  // (pull_request) / GITHUB_REF_NAME (push) — the same branch the seat pushed, so the same mapping applies.
  branch = resolveBranchName(branch, process.env);
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
  // CODEX: LEAD RULING — LANE-CODEX-01. This guard recognised no CODEX seat and no codex/
  // branch mapping, so every Codex push failed 03b regardless of what the diff contained --
  // the same "guard is the bottleneck, not the seat's work" failure already fixed once for
  // Cursor above. Four branches held: e3d7949c4f, b3099ec66c, c35cfe28db, 70c2d5845a.
  else if (/^codex\//.test(branch.toLowerCase())) seat = 'CODEX';
  // DEVIN-A: owner-assigned seat for E15.6 three void/reversal guards. Devin-A is RETIRED
  // per the lane map but was reactivated by owner order 2026-09-23 for this specific task.
  // LANE_CROSS: this guard recognised no DEVIN-A seat, blocking the push. Minimum viable
  // fix — add the branch prefix mapping. Devin-A owns the factoring lane per docs/bus/LANES.md.
  else if (/^devin-a\//.test(branch.toLowerCase())) seat = 'DEVIN-A';
  // DEPENDABOT: LEAD 10-21 22:25Z — a dependabot/* branch had no seat ("could not resolve the seat"), so every dependency
  // bump was red on this guard by construction (masked only while heavy CI stopped earlier). Its lane (LANES.md
  // "## DEPENDABOT") is the package manifests, lockfiles and workflows — nothing else, and no SHARED grant.
  else if (/^dependabot\//.test(branch.toLowerCase())) seat = 'DEPENDABOT';
}
if (!/^(CC-[123]|LEAD|CURSOR|CODEX|DEVIN-A|DEPENDABOT)$/.test(seat)) {
  fail(`could not resolve the seat. Set SEAT=CC-1|CC-2|CC-3|LEAD|CURSOR|CODEX|DEVIN-A, or name the branch ` +
       `cc-1/<topic> (seat), claude/<topic> (Lead), cursor/<topic> (Cursor), codex/<topic> (Codex), ` +
       `or devin-a/<topic> (Devin-A). ` +
       `A PR with no owner is exactly how two seats wrote the same rows.`);
}


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
const { violations, forbidden } = classifyFiles(files, seat, sections);

let commitBody = '';
try {
  const mb = execSync(`git merge-base ${BASE} HEAD`, { encoding: 'utf8' }).trim();
  commitBody = execSync(`git log ${mb}..HEAD --format=%B`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch {}
const { authorized: lineAuthorized, unauthorized } = authorizeViolations(violations, commitBody);

if (forbidden.length) {
  fail(`${forbidden.length} file(s) in the FORBIDDEN list. No ruling overrides this:\n` +
       forbidden.map((f) => `    ${f}`).join('\n'));
}

if (unauthorized.length && !crossOk) {
  fail(`${seat} touched ${unauthorized.length} file(s) outside its lane:\n` +
       unauthorized.map((v) => `    ${v.file}   -> owned by ${v.owner}`).join('\n') +
       `\n\n  To cross: add "SURFACE-BREACH-AUTHORIZED: <owning seat> <reason>" exactly as the Lead wrote it to a commit` +
       `\n  body on this branch (the same line verify-seat-surface-ownership accepts), or re-run with` +
       `\n  LANE_CROSS=<ruling-filename> and the same line in the PR body.`);
}

if (lineAuthorized.length) {
  console.log(`  ${lineAuthorized.length} out-of-lane file(s), authorised by SURFACE-BREACH-AUTHORIZED:`);
  for (const v of lineAuthorized) console.log(`    ${v.file}   -> ${v.owner}`);
}
if (unauthorized.length && crossOk) {
  console.log(`  ${unauthorized.length} out-of-lane file(s), authorised by LANE_CROSS:`);
  for (const v of unauthorized) console.log(`    ${v.file}   -> ${v.owner}`);
}

ok(`${seat}: ${files.length} changed file(s), all in lane.`);
