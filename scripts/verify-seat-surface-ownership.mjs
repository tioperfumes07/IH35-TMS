#!/usr/bin/env node
/**
 * §0b SEAT SURFACE OWNERSHIP (owner-dictated 2026-09-04, verbatim table — Rule 6: transcribe, never
 * invent). This was cited as the enforcement mechanism in the law doc and 4 bus docs for weeks;
 * 0 files implemented it and .github/CODEOWNERS carries no per-seat mapping (8 notify-only paths) —
 * §0b was unenforced this entire time. This guard is that enforcement.
 *
 * THE TABLE (transcribed verbatim, do not edit without a new owner-dictated table):
 *
 *   Seat    | Surface                                                                    | Money
 *   Cursor  | pages/dispatch/**, components/dispatch/**, book-load.service.ts           | Yes
 *   CC-1    | pages/accounting/**, backend/accounting/**, dispatch/mileage/**,
 *           | lane-mileage.service.ts                                                    | Yes
 *   CC-2    | pages/banking/**, backend/banking/**                                       | Yes
 *   CC-3    | pages/safety/**, backend/compliance/**                                     | No
 *   Codex   | pages/maintenance/**, backend/maintenance/**                               | No
 *   Cascade | pages/lists/**, pages/reports/**                                           | No
 *
 * A file not covered by ANY row above is unowned/shared territory — touching it is never a
 * surface breach for any seat (this guard only stops CROSS-surface stepping, not repo-wide
 * lockdown). Surface fragments are matched as path segments anywhere in the real repo path (the
 * table's own shorthand omits the apps/frontend/src or apps/backend/src prefix — this guard does
 * not invent which prefix that is per entry, it matches the given fragment wherever it occurs) or,
 * for bare filenames (book-load.service.ts, lane-mileage.service.ts), by basename.
 *
 * SEAT INFERENCE — branch prefix, same convention verify-migration-lane-band.mjs already
 * establishes (and the SAME bug it already fixed once, GUARD-LANE-BYPASS-01: a generic prefix
 * (chore/, feat/, fix/, or anything unrecognized) must NEVER resolve to a seat — that is exactly
 * how Devin-A inherited Cursor's migration authority by accident. An unmapped branch touching an
 * owned surface fails closed, same as here.
 *
 * ESCAPE HATCH — exactly one, per the owner's own wording: a commit body carrying
 *   SURFACE-BREACH-AUTHORIZED: <owning seat> <reason>
 * where <owning seat> matches the surface actually being touched. This guard does not check WHO
 * posted that line first (retroactive ACK is owner-accepted, see #20316) — only that it is present
 * and names the correct seat.
 */
import { spawnSync } from "node:child_process";

const SURFACES = [
  { seat: "Cursor", fragments: ["pages/dispatch", "components/dispatch"], files: ["book-load.service.ts"], money: true },
  { seat: "CC-1", fragments: ["pages/accounting", "backend/accounting", "dispatch/mileage"], files: ["lane-mileage.service.ts"], money: true },
  { seat: "CC-2", fragments: ["pages/banking", "backend/banking"], files: [], money: true },
  { seat: "CC-3", fragments: ["pages/safety", "backend/compliance"], files: [], money: false },
  { seat: "Codex", fragments: ["pages/maintenance", "backend/maintenance"], files: [], money: false },
  { seat: "Cascade", fragments: ["pages/lists", "pages/reports"], files: [], money: false },
];

// GUARD-LANE-BYPASS-01 precedent: only an actually seat-scoped prefix resolves to a seat. Generic
// prefixes (chore/, feat/, fix/, docs/, and anything else) stay UNMAPPED on purpose.
const BRANCH_PREFIXES = [
  { seat: "Cursor", prefixes: ["cursor/", "cursoragent/"] },
  { seat: "CC-1", prefixes: ["cc1/", "cc-1/", "claude/"] },
  { seat: "CC-2", prefixes: ["cc2/", "cc-2/"] },
  { seat: "CC-3", prefixes: ["cc3/", "cc-3/"] },
  { seat: "Codex", prefixes: ["codex/"] },
  { seat: "Cascade", prefixes: ["cascade/"] },
];

const LABEL = "verify-seat-surface-ownership";
const AUTH_RE = /SURFACE-BREACH-AUTHORIZED:\s*([A-Za-z0-9-]+)/i;

export function seatForBranch(branch) {
  const b = (branch || "").toLowerCase();
  for (const { seat, prefixes } of BRANCH_PREFIXES) {
    if (prefixes.some((p) => b.startsWith(p))) return seat;
  }
  return null; // unmapped — generic/unknown prefix, deliberately not inferred
}

/** True if every segment of `fragment` (split on "/") appears in `pathSegments`, IN ORDER, but not
 *  necessarily adjacent — the table's own shorthand ("backend/banking") omits the real repo's
 *  apps/backend/src/ prefix, so "backend" and "banking" land 2 segments apart on disk
 *  (apps/backend/src/banking/**), not adjacent. Requiring order (not adjacency) matches the
 *  shorthand's intent without hardcoding which exact prefix separates them. */
function fragmentMatches(fragment, pathSegments) {
  const wanted = fragment.split("/").filter(Boolean);
  let cursor = 0;
  for (const seg of wanted) {
    const idx = pathSegments.indexOf(seg, cursor);
    if (idx === -1) return false;
    cursor = idx + 1;
  }
  return true;
}

/** Which seat's surface (if any) a single changed file falls in. Null = unowned/shared. */
export function surfaceOwnerForFile(filePath) {
  const p = filePath.replace(/\\/g, "/");
  const segments = p.split("/").filter(Boolean);
  const base = segments[segments.length - 1];
  for (const { seat, fragments, files } of SURFACES) {
    if (files.includes(base)) return seat;
    if (fragments.some((f) => fragmentMatches(f, segments))) return seat;
  }
  return null;
}

/**
 * Pure check: given the acting branch, the list of changed file paths, and the commit body text,
 * return the list of surface-breach failures. No git calls — --selftest proves this with fixtures.
 */
export function checkSurfaceOwnership(branch, changedFiles, commitBody) {
  const actingSeat = seatForBranch(branch);
  const authMatch = AUTH_RE.exec(commitBody || "");
  const authorizedSeat = authMatch ? authMatch[1] : null;

  const failures = [];
  for (const file of changedFiles) {
    const owner = surfaceOwnerForFile(file);
    if (!owner) continue; // unowned/shared territory — never a breach
    if (owner === actingSeat) continue; // touching your own surface is fine

    if (authorizedSeat && authorizedSeat.toLowerCase() === owner.toLowerCase()) continue; // escape hatch used correctly

    failures.push(
      actingSeat
        ? `${file} is in ${owner}'s surface (§0b) — branch is ${actingSeat}'s. Add "SURFACE-BREACH-AUTHORIZED: ${owner} <reason>" to the commit body, posted by ${owner}, to cross it.`
        : `${file} is in ${owner}'s surface (§0b) — branch prefix does not identify a seat (unmapped branches fail closed, same as verify-migration-lane-band.mjs's GUARD-LANE-BYPASS-01). Add "SURFACE-BREACH-AUTHORIZED: ${owner} <reason>" to the commit body to cross it.`
    );
  }
  return failures;
}

function runSelftest() {
  // Clean: cc2/ branch, only touches its own surface.
  const clean = checkSurfaceOwnership("cc2/fix-thing", ["apps/frontend/src/pages/banking/BankingHome.tsx", "apps/backend/src/banking/routes.ts"], "FINDING: BANK-FX\n\nLANE: FINANCIAL");
  if (clean.length !== 0) throw new Error(`selftest: own-surface files must pass — got ${JSON.stringify(clean)}`);

  // Clean: touching genuinely unowned/shared territory from any branch.
  const shared = checkSurfaceOwnership("cc2/docs-only", ["docs/audit/GUARD-WORKORDERS.md", "scripts/verify-something.mjs"], "");
  if (shared.length !== 0) throw new Error(`selftest: unowned/shared files must never be a breach — got ${JSON.stringify(shared)}`);

  // Violation: cc2/ branch reaches into Cursor's dispatch surface, no authorization.
  const breach = checkSurfaceOwnership("cc2/fix-thing", ["apps/frontend/src/pages/dispatch/DispatchBoard.tsx"], "FINDING: BANK-FX\n\nLANE: FINANCIAL");
  if (breach.length !== 1 || !breach[0].includes("Cursor")) {
    throw new Error(`selftest: an unauthorized cross-surface touch must be rejected naming the real owner — got ${JSON.stringify(breach)}`);
  }

  // KEY CASE — a CORRECT, well-intentioned fix in the wrong surface must STILL be rejected. This
  // check is purely path-based; content quality is irrelevant to it by construction (the function
  // never reads file content), but assert it explicitly so the intent can never be "optimized away".
  const correctFixWrongSurface = checkSurfaceOwnership(
    "cc2/genuinely-good-fix",
    ["apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx"],
    "FINDING: a real, well-tested, provably-correct fix for a genuine bug — the fix itself is right, the SURFACE is wrong"
  );
  if (correctFixWrongSurface.length !== 1) {
    throw new Error("selftest: a correct fix in the wrong surface must still be rejected — content correctness never waives a surface breach");
  }

  // Escape hatch: the SAME breach, now with SURFACE-BREACH-AUTHORIZED naming the real owner — passes.
  const authorized = checkSurfaceOwnership(
    "cc2/fix-thing",
    ["apps/frontend/src/pages/dispatch/DispatchBoard.tsx"],
    "FINDING: BANK-FX\n\nSURFACE-BREACH-AUTHORIZED: Cursor filed and pre-cleared by the dispatch seat, see #20316-style retroactive ACK"
  );
  if (authorized.length !== 0) throw new Error(`selftest: SURFACE-BREACH-AUTHORIZED naming the real owner must waive the breach — got ${JSON.stringify(authorized)}`);

  // Escape hatch misuse: authorization names the WRONG seat — must still fail.
  const wrongAuth = checkSurfaceOwnership(
    "cc2/fix-thing",
    ["apps/frontend/src/pages/dispatch/DispatchBoard.tsx"],
    "SURFACE-BREACH-AUTHORIZED: CC-3 wrong seat named, does not own dispatch"
  );
  if (wrongAuth.length !== 1) throw new Error("selftest: authorization naming the wrong seat must not waive a real breach");

  // GUARD-LANE-BYPASS-01 precedent: an unmapped/generic branch prefix touching an owned surface
  // fails closed — it must NOT silently pass just because no seat could be inferred.
  const unmapped = checkSurfaceOwnership("chore/some-fix", ["apps/backend/src/banking/routes.ts"], "");
  if (unmapped.length !== 1 || !unmapped[0].includes("CC-2")) {
    throw new Error(`selftest: an unmapped branch prefix touching an owned surface must fail closed — got ${JSON.stringify(unmapped)}`);
  }

  // Bare-filename surface entries (book-load.service.ts, lane-mileage.service.ts) match by basename
  // regardless of directory.
  const bareFile = checkSurfaceOwnership("cc2/fix-thing", ["apps/backend/src/dispatch/book-load.service.ts"], "");
  if (bareFile.length !== 1 || !bareFile[0].includes("Cursor")) {
    throw new Error(`selftest: the bare-filename surface entry (book-load.service.ts) must resolve to Cursor regardless of directory — got ${JSON.stringify(bareFile)}`);
  }

  console.log(
    `[${LABEL}] --selftest OK (own-surface passes; shared/unowned files never breach; unauthorized cross-surface rejected naming the real owner; a CORRECT fix in the wrong surface is still rejected; SURFACE-BREACH-AUTHORIZED naming the real owner waives it; naming the wrong seat does not; an unmapped branch prefix fails closed; bare-filename entries match by basename)`
  );
}

if (process.argv.includes("--selftest")) {
  try {
    runSelftest();
  } catch (err) {
    console.error(String(err?.message ?? err));
    process.exit(1);
  }
  process.exit(0);
}

function sh(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: "utf8" });
  return (res.stdout || "").trim();
}

const branch = process.env.GITHUB_HEAD_REF || sh("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
const changedFiles = sh("git", ["diff", "origin/main...HEAD", "--name-only"])
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean);
const commitBody = sh("git", ["log", "origin/main..HEAD", "--format=%B"]);

const failures = checkSurfaceOwnership(branch, changedFiles, commitBody);

if (failures.length) {
  console.error(`${LABEL} FAIL — branch "${branch}"`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`${LABEL} OK — branch "${branch}" touches no other seat's §0b surface without authorization`);
process.exit(0);
