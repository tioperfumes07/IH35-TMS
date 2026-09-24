#!/usr/bin/env node
// GUARD — verify-bus-files-are-readable (ROUND E23, Q34, DEVIN-B)
//
// The bus channel (docs/bus/) is the coordination backbone for all seats. This guard enforces:
//
// 1. SIZE CAP: every NOW-<SEAT>.md file must be <= 4KB (4096 bytes). A NOW file over 4KB is
//    unreadable — seats skim it at the start of every turn, and a 50KB NOW file is worse than
//    no NOW file because nobody reads it. The owner rewrites these each round; they should
//    be short and current.
//
// 2. STALENESS ARM: every NOW-<SEAT>.md file must have been modified within the last 48 hours.
//    A NOW file older than 48 hours means the seat is idling — nobody has picked up the
//    instructions. This is what would have caught Codex idling 12 days and CC-2 idling on a
//    dead signal. The staleness is measured by the file's mtime (filesystem), not git history.
//
// 3. ARCHIVE ARM: INBOX-*.md and OUTBOX-*.md files over 50KB should be archived (moved to
//    docs/bus/archive/). The 83-548KB files are unreadable and slow down every `git pull`.
//    This guard REPORTS them (does not auto-archive — archiving is a separate action).
//
// Static, no DATABASE_URL: a filesystem scan that never reads money data.
//
// Self-test: node scripts/verify-bus-files-are-readable.mjs --selftest
export const ALLOW_OFFLINE_SKIP =
  "pure filesystem scan of docs/bus/ — never connects to a database";

import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-bus-files-are-readable";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const BUS_DIR = path.join(ROOT, "docs", "bus");

const NOW_SIZE_CAP_BYTES = 4096; // 4KB
const NOW_STALENESS_HOURS = 48;
const INBOX_OUTBOX_ARCHIVE_THRESHOLD_BYTES = 50 * 1024; // 50KB — report, don't auto-archive

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Classify a bus file. Pure function — exported for selftest.
 * @param {{ name: string, size: number, mtime: number, now: number }} file
 * @returns {string[]} problems, empty when clean
 */
export function classifyBusFile(file) {
  const problems = [];
  const { name, size, mtime, now } = file;

  // NOW-<SEAT>.md size cap
  if (name.startsWith("NOW-") && name.endsWith(".md")) {
    if (size > NOW_SIZE_CAP_BYTES) {
      problems.push(
        `NOW_SIZE_OVER_CAP: ${size} bytes > ${NOW_SIZE_CAP_BYTES} (4KB) — unreadable, trim it`,
      );
    }
    // Staleness arm — skip historical NOW files (dated ones like NOW-2026-09-04-*)
    const isHistorical = /^NOW-\d{4}-\d{2}-\d{2}-/.test(name);
    if (!isHistorical) {
      const ageHours = (now - mtime) / ONE_HOUR_MS;
      if (ageHours > NOW_STALENESS_HOURS) {
        problems.push(
          `NOW_STALE: ${ageHours.toFixed(1)} hours old > ${NOW_STALENESS_HOURS}h — seat may be idling`,
        );
      }
    }
  }

  // INBOX/OUTBOX archive threshold (report only)
  if (
    (name.startsWith("INBOX-") || name.startsWith("OUTBOX-")) &&
    name.endsWith(".md") &&
    size > INBOX_OUTBOX_ARCHIVE_THRESHOLD_BYTES
  ) {
    problems.push(
      `ARCHIVE_CANDIDATE: ${size} bytes > ${INBOX_OUTBOX_ARCHIVE_THRESHOLD_BYTES} (50KB) — should be archived to docs/bus/archive/`,
    );
  }

  return problems;
}

function runSelftest() {
  const now = Date.now();
  const fixtures = [
    // Clean: small, fresh NOW file
    {
      name: "small fresh NOW file",
      file: { name: "NOW-DEVIN-B.md", size: 2000, mtime: now - 2 * ONE_HOUR_MS, now },
      expect: [],
    },
    // RED: NOW file over 4KB
    {
      name: "NOW file over 4KB",
      file: { name: "NOW-CC-1.md", size: 5000, mtime: now - 1 * ONE_HOUR_MS, now },
      expect: ["NOW_SIZE_OVER_CAP"],
    },
    // RED: NOW file stale (over 48h)
    {
      name: "stale NOW file (50h old)",
      file: { name: "NOW-CODEX.md", size: 1000, mtime: now - 50 * ONE_HOUR_MS, now },
      expect: ["NOW_STALE"],
    },
    // Clean: historical NOW file (dated) — no staleness check
    {
      name: "historical NOW file (dated)",
      file: { name: "NOW-2026-09-04-PUSH-ALL.md", size: 2000, mtime: now - 720 * ONE_HOUR_MS, now },
      expect: [],
    },
    // RED: OUTBOX over 50KB (archive candidate)
    {
      name: "large OUTBOX (100KB)",
      file: { name: "OUTBOX-CC-3.md", size: 100000, mtime: now, now },
      expect: ["ARCHIVE_CANDIDATE"],
    },
    // Clean: small OUTBOX
    {
      name: "small OUTBOX",
      file: { name: "OUTBOX-DEVIN-B.md", size: 5000, mtime: now, now },
      expect: [],
    },
    // RED: both size and stale
    {
      name: "NOW file over 4KB AND stale",
      file: { name: "NOW-CC-2.md", size: 6000, mtime: now - 72 * ONE_HOUR_MS, now },
      expect: ["NOW_SIZE_OVER_CAP", "NOW_STALE"],
    },
  ];

  let pass = 0;
  let fail = 0;
  for (const { name, file, expect: exp } of fixtures) {
    const got = classifyBusFile(file);
    const gotKinds = got.map((p) => p.split(":")[0]);
    const expKinds = exp;
    const match =
      gotKinds.length === expKinds.length &&
      expKinds.every((k) => gotKinds.includes(k));
    if (!match) {
      console.error(`${LABEL} --selftest FAIL — ${name}: expected ${JSON.stringify(expKinds)}, got ${JSON.stringify(gotKinds)}`);
      fail += 1;
    } else {
      pass += 1;
    }
  }

  if (fail > 0) {
    process.exitCode = 1;
  } else {
    console.log(`${LABEL} --selftest PASS — ${pass} classifier fixtures all correct`);
  }
}

function run({ selftest }) {
  if (selftest) {
    runSelftest();
    return;
  }

  if (!fs.existsSync(BUS_DIR)) {
    console.log(`${LABEL}: SKIP — docs/bus/ does not exist`);
    return;
  }

  const now = Date.now();
  const files = fs
    .readdirSync(BUS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((name) => {
      const fullPath = path.join(BUS_DIR, name);
      const stat = fs.statSync(fullPath);
      return { name, size: stat.size, mtime: stat.mtimeMs, now };
    });

  const allProblems = [];
  const archiveCandidates = [];

  for (const file of files) {
    const problems = classifyBusFile(file);
    for (const p of problems) {
      const entry = { name: file.name, problem: p };
      allProblems.push(entry);
      if (p.startsWith("ARCHIVE_CANDIDATE")) {
        archiveCandidates.push(entry);
      }
    }
  }

  // Separate hard failures (size cap + staleness) from archive candidates (report only)
  const hardFailures = allProblems.filter((p) => !p.problem.startsWith("ARCHIVE_CANDIDATE"));

  if (hardFailures.length > 0) {
    const sample = hardFailures.slice(0, 10).map((f) => `  ${f.name}: ${f.problem}`).join("\n");
    console.error(
      `${LABEL}: FAIL — ${hardFailures.length} hard failure(s) in docs/bus/.\n` +
        `First ${Math.min(10, hardFailures.length)}:\n${sample}`,
    );
    process.exitCode = 1;
  }

  if (archiveCandidates.length > 0) {
    const sample = archiveCandidates.map((f) => `  ${f.name}: ${f.problem}`).join("\n");
    console.warn(
      `${LABEL}: WARN — ${archiveCandidates.length} archive candidate(s) (INBOX/OUTBOX over 50KB, report only):\n${sample}`,
    );
  }

  if (hardFailures.length === 0) {
    console.log(
      `${LABEL}: PASS — ${files.length} bus files scanned, 0 hard failures. ` +
        `${archiveCandidates.length} archive candidate(s) reported as warnings.`,
    );
  }
}

await run({ selftest: process.argv.includes("--selftest") });
