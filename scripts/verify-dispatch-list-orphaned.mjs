#!/usr/bin/env node
/**
 * verify-dispatch-list-orphaned.mjs  (0243-c1-4)
 *
 * DispatchList.tsx is an orphaned duplicate of the live dispatch list surface
 * (DispatchPage → DispatchBoard). Rule 07: archive-not-delete.
 *
 * This guard proves:
 *   1. The file remains present with the @archived annotation.
 *   2. No live routes/manifest/pages import the archived module (type or value).
 *      Tests + the archived file itself may still reference it.
 *
 * Live replacement: apps/frontend/src/pages/dispatch/DispatchBoard.tsx
 * Shared props: apps/frontend/src/components/dispatch/dispatchListTypes.ts
 *
 * Usage:
 *   node scripts/verify-dispatch-list-orphaned.mjs
 *   node scripts/verify-dispatch-list-orphaned.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const ARCHIVED_REL = "apps/frontend/src/components/dispatch/DispatchList.tsx";
const ARCHIVE_MARKER = "@archived — DispatchList";
const SCAN_ROOT = "apps/frontend/src";

/** Live mount surfaces that must NEVER import DispatchList (type or value). */
const LIVE_IMPORT_PREFIXES = [
  "apps/frontend/src/routes/",
  "apps/frontend/src/pages/",
  "apps/frontend/src/router/",
];

function isTestFile(rel) {
  return /\.test\.[tj]sx?$/.test(rel) || /(^|\/)__tests__\//.test(rel);
}

function importsDispatchListModule(src) {
  const importRe = /\bfrom\s*["']([^"']+)["']/g;
  let m;
  while ((m = importRe.exec(src)) !== null) {
    const spec = m[1];
    // Match .../DispatchList or .../DispatchList.tsx — not dispatchListTypes
    if (/(^|\/)DispatchList(\.tsx)?$/.test(spec)) return true;
  }
  return false;
}

function listSrc(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      listSrc(full, out);
    } else if (/\.[tj]sx?$/.test(entry.name)) {
      out.push(full);
    }
  }
}

function isLiveSurface(rel) {
  return LIVE_IMPORT_PREFIXES.some((p) => rel.startsWith(p));
}

function scanLiveImporters() {
  const files = [];
  const abs = path.join(repoRoot, SCAN_ROOT);
  if (fs.existsSync(abs)) listSrc(abs, files);
  const offenders = [];
  for (const full of files) {
    const rel = path.relative(repoRoot, full).split(path.sep).join("/");
    if (rel === ARCHIVED_REL) continue;
    if (isTestFile(rel)) continue;
    if (!isLiveSurface(rel)) continue;
    const src = fs.readFileSync(full, "utf8");
    if (importsDispatchListModule(src)) {
      offenders.push(rel);
    }
  }
  return offenders;
}

export function run() {
  const failures = [];
  const full = path.join(repoRoot, ARCHIVED_REL);
  if (!fs.existsSync(full)) {
    failures.push(`${ARCHIVED_REL} — MISSING (do not delete; mark @archived instead)`);
  } else {
    const source = fs.readFileSync(full, "utf8");
    if (!source.includes(ARCHIVE_MARKER)) {
      failures.push(`${ARCHIVED_REL} — missing "${ARCHIVE_MARKER}" annotation`);
    }
  }

  const liveImporters = scanLiveImporters();
  for (const rel of liveImporters) {
    failures.push(
      `${rel} imports archived DispatchList — use DispatchBoard / dispatchListTypes instead`,
    );
  }

  if (failures.length) {
    console.error("[verify-dispatch-list-orphaned] FAIL:");
    for (const message of failures) console.error(`  - ${message}`);
    return { ok: false, failures };
  }

  console.log(
    "[verify-dispatch-list-orphaned] OK — DispatchList present+@archived; zero live routes/pages imports",
  );
  return { ok: true, failures: [] };
}

function selftest() {
  const bad = `import type { DispatchListProps } from "../../components/dispatch/DispatchList";\n`;
  const okTypes = `import type { DispatchListProps } from "../../components/dispatch/dispatchListTypes";\n`;
  const okBoard = `import { DispatchBoard } from "./dispatch/DispatchBoard";\n`;

  if (!importsDispatchListModule(bad)) {
    console.error("[verify-dispatch-list-orphaned] SELFTEST FAIL — did not detect DispatchList import");
    process.exit(1);
  }
  if (importsDispatchListModule(okTypes)) {
    console.error("[verify-dispatch-list-orphaned] SELFTEST FAIL — false positive on dispatchListTypes");
    process.exit(1);
  }
  if (importsDispatchListModule(okBoard)) {
    console.error("[verify-dispatch-list-orphaned] SELFTEST FAIL — false positive on DispatchBoard");
    process.exit(1);
  }
  if (!ARCHIVE_MARKER.startsWith("@archived")) {
    console.error("[verify-dispatch-list-orphaned] SELFTEST FAIL — marker shape");
    process.exit(1);
  }
  console.log(
    "[verify-dispatch-list-orphaned] SELFTEST PASS — detects DispatchList remount; ignores dispatchListTypes",
  );
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else process.exit(run().ok ? 0 : 1);
}
