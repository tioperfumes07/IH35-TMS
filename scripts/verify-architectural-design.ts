#!/usr/bin/env tsx
/**
 * verify-architectural-design.ts
 *
 * Reads docs/specs/IH35_ARCHITECTURAL_DESIGN.md to extract the canonical
 * tab count per module, then scans the frontend module pages for sub-nav
 * route definitions, and FAILS the build if they diverge.
 *
 * This is the enforcement gate that prevents Phase 3+ spec drift.
 *
 * Run via: npm run verify:arch-design
 * Runs in CI on every push to main and every PR.
 *
 * PARSER (two-pass):
 *   Pass 1: find every `## MODULE N — NAME` heading
 *   Pass 2: for each module, find the next `### Sub-nav tabs (X` heading
 *           between this module heading and the next module heading
 *           (or the end of the file)
 *
 * Module name is normalized: leading "MODULE N — " stripped, trailing
 * decoration (warning emoji, "JORGE'S CALLOUT", parenthetical notes) stripped.
 */

import * as fs from "node:fs";
import * as path from "node:path";

interface ModuleSpec {
  name: string;
  expectedTabs: number;
  rawHeading: string;
}

const ARCH_DESIGN_PATH = "docs/specs/IH35_ARCHITECTURAL_DESIGN.md";
const FRONTEND_PAGES = "apps/frontend/src/pages";

// Map architectural design module names to frontend page directories.
// Add entries here as new modules ship.
const MODULE_DIR_MAP: Record<string, string> = {
  HOME: "home",
  MAINTENANCE: "maintenance",
  ACCOUNTING: "accounting",
  BANKING: "banking",
  "FUEL PLANNER": "fuel",
  SAFETY: "safety",
  DRIVERS: "drivers",
  CUSTOMERS: "customers",
  DISPATCH: "dispatch",
  VENDORS: "vendors",
  DOCUMENTS: "docs",
  "LISTS / CATALOGS": "lists",
  REPORTS: "reports",
  "425C": "form425c",
  "425C (CH.11 DIP UST REPORT)": "form425c",
};

function normalizeModuleName(raw: string): string {
  // raw examples:
  //   "MODULE 1 — HOME / Owner Dashboard"   → "HOME"
  //   "MODULE 2 — MAINTENANCE"              → "MAINTENANCE"
  //   "MODULE 6 — SAFETY ⚠️ MOST GAPS — JORGE'S CALLOUT" → "SAFETY"
  //   "MODULE 12 — LISTS / CATALOGS"        → "LISTS / CATALOGS" (compound name, keep)
  //   "MODULE 14 — 425C (Ch.11 DIP UST Report)" → "425C"
  //   "MODULE 5 — FUEL PLANNER"             → "FUEL PLANNER"

  // Step 1: strip leading "MODULE N — " or "MODULE N - "
  let s = raw.replace(/^MODULE\s+\d+\s*[—\-]\s*/i, "");

  // Step 2: strip everything from first em-dash, parenthetical, OR non-ASCII char
  // (handles ⚠️, "— JORGE'S CALLOUT", "(Ch.11 ...)" all in one pass)
  s = s.replace(/\s*[—\-(].*$/, "");      // first em-dash, hyphen, or paren
  s = s.replace(/\s*[^\x20-\x7E].*$/, ""); // first non-ASCII (emoji and beyond)

  // Step 3: handle compound vs subtitle slash-separated names
  // "HOME / Owner Dashboard" — second part is mixed case = subtitle, drop it
  // "LISTS / CATALOGS" — both parts uppercase = compound name, keep both
  if (s.includes("/")) {
    const parts = s.split("/").map((p) => p.trim());
    const allUpper = parts.every((p) => p === p.toUpperCase());
    if (!allUpper) {
      s = parts[0]; // subtitle pattern — keep first part only
    }
  }

  // Step 4: collapse whitespace + uppercase
  s = s.replace(/\s+/g, " ").trim().toUpperCase();
  return s;
}

function parseExpectedTabs(): ModuleSpec[] {
  if (!fs.existsSync(ARCH_DESIGN_PATH)) {
    console.error(`✘ Architectural design not found at ${ARCH_DESIGN_PATH}`);
    process.exit(1);
  }
  const md = fs.readFileSync(ARCH_DESIGN_PATH, "utf8");
  const lines = md.split(/\r?\n/);

  // Pass 1: indices of every `## MODULE N — NAME` heading
  const moduleHeadings: { lineIdx: number; raw: string; name: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##\s+(MODULE\s+\d+\s*[—\-].*)$/i);
    if (m) {
      const raw = m[1].trim();
      moduleHeadings.push({
        lineIdx: i,
        raw,
        name: normalizeModuleName(raw),
      });
    }
  }

  // Pass 2: for each module, find next `### Sub-nav tabs (X` between this and next heading
  const out: ModuleSpec[] = [];
  for (let mi = 0; mi < moduleHeadings.length; mi++) {
    const start = moduleHeadings[mi].lineIdx;
    const end = mi + 1 < moduleHeadings.length ? moduleHeadings[mi + 1].lineIdx : lines.length;
    let foundCount: number | null = null;
    for (let i = start; i < end; i++) {
      // Match either:
      //   "### Sub-nav tabs (12 — locked)"
      //   "### Sub-nav tabs (8 total — UPDATED ...)"
      //   "### Top tabs (mobile-friendly bottom nav — 5)"   ← Driver PWA edge case
      //   "### Sub-nav tabs (4)"
      const tabMatch = lines[i].match(/^###\s+(?:Sub-nav|Top)\s+tabs?\s*\((\d+)/i);
      if (tabMatch) {
        foundCount = parseInt(tabMatch[1], 10);
        break;
      }
    }
    if (foundCount !== null) {
      out.push({
        name: moduleHeadings[mi].name,
        expectedTabs: foundCount,
        rawHeading: moduleHeadings[mi].raw,
      });
    }
  }
  return out;
}

function countActualTabs(moduleDir: string): number | null {
  const dir = path.join(FRONTEND_PAGES, moduleDir);
  if (!fs.existsSync(dir)) return null;

  // Look for SubNav-style array definitions in any .tsx/.ts file under the module dir.
  // Patterns supported (any one match wins per file; max across files used):
  //   const SUB_NAV = [ ... ]
  //   const TABS = [ ... ]
  //   const SUBNAV = [ ... ]
  //   tabs: [ ... ]
  let maxCount = 0;
  const walk = (d: string) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      const s = fs.statSync(p);
      if (s.isDirectory()) walk(p);
      else if (f.endsWith(".tsx") || f.endsWith(".ts")) {
        const content = fs.readFileSync(p, "utf8");
        const arrayMatches = content.matchAll(
          /(?:const|let)\s+(?:SUB_NAV|TABS|SUBNAV|tabs)\s*[:=]\s*\[([^\]]*?)\]/gs
        );
        for (const am of arrayMatches) {
          const inner = am[1].trim();
          if (inner.length === 0) continue;
          const entries = inner.split(/\},\s*\{/).length;
          if (entries > maxCount) maxCount = entries;
        }
      }
    }
  };
  try {
    walk(dir);
  } catch {
    return null;
  }
  return maxCount;
}

function main() {
  const expected = parseExpectedTabs();
  if (expected.length === 0) {
    console.error("✘ Could not parse any module / tab counts from architectural design.");
    console.error(`  Expected per-module headings of format: '## MODULE N — NAME'`);
    console.error(`  followed by '### Sub-nav tabs (X — ...)' (X = integer count)`);
    process.exit(1);
  }

  console.log(`Parsed ${expected.length} module(s) from ${ARCH_DESIGN_PATH}:`);
  for (const m of expected) {
    console.log(`  • ${m.name} → ${m.expectedTabs} tabs (heading: '${m.rawHeading}')`);
  }
  console.log("");

  const failures: string[] = [];
  const warnings: string[] = [];

  for (const mod of expected) {
    // DRIVER PWA is a separate app; skip from this check.
    if (mod.name.includes("DRIVER PWA")) {
      console.log(`◦ ${mod.name}: skipped (separate Driver PWA app)`);
      continue;
    }
    const dirName = MODULE_DIR_MAP[mod.name];
    if (!dirName) {
      warnings.push(`⚠ No frontend dir mapping for module: ${mod.name} (add to MODULE_DIR_MAP)`);
      continue;
    }
    const actual = countActualTabs(dirName);
    if (actual === null) {
      warnings.push(`⚠ Frontend dir not found yet: ${dirName} (expected ${mod.expectedTabs} tabs) — module not yet implemented`);
      continue;
    }
    if (actual === 0) {
      warnings.push(`⚠ No SubNav array detected in ${dirName} (expected ${mod.expectedTabs} tabs) — module may use a different pattern; review verify script`);
      continue;
    }
    if (actual !== mod.expectedTabs) {
      failures.push(
        `✘ MODULE MISMATCH: ${mod.name} (${dirName}) — architectural design says ${mod.expectedTabs} tabs, code has ${actual}`
      );
    } else {
      console.log(`✓ ${mod.name}: ${actual} tabs match architectural design`);
    }
  }

  if (warnings.length > 0) {
    console.log("\n--- WARNINGS (non-fatal) ---");
    warnings.forEach((w) => console.log(w));
  }

  if (failures.length > 0) {
    console.error("\n--- FAILURES (build blocked) ---");
    failures.forEach((f) => console.error(f));
    console.error(
      "\nFix: Either add the missing tabs to the module OR update docs/specs/IH35_ARCHITECTURAL_DESIGN.md to reflect the new design (with Jorge approval)."
    );
    process.exit(1);
  }

  console.log("\n✅ All implemented modules match architectural design");
}

main();
