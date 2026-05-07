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
 */

import * as fs from "node:fs";
import * as path from "node:path";

interface ModuleSpec {
  name: string;
  expectedTabs: number;
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
};

function parseExpectedTabs(): ModuleSpec[] {
  if (!fs.existsSync(ARCH_DESIGN_PATH)) {
    console.error(`✘ Architectural design not found at ${ARCH_DESIGN_PATH}`);
    process.exit(1);
  }
  const md = fs.readFileSync(ARCH_DESIGN_PATH, "utf8");
  // Match lines like:  "  6. SAFETY                      (12 tabs..."
  // Or markdown bullets: "- 6. SAFETY (12 tabs)"
  const re = /(?:^|\n)\s*(?:[-*]\s+)?\d+\.\s+([A-Z0-9 \/]+?)\s+\((\d+)\s+tab/gi;
  const out: ModuleSpec[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    out.push({ name: m[1].trim(), expectedTabs: parseInt(m[2], 10) });
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
          // Count entries by splitting on top-level `},{` boundaries.
          // This is approximate but good enough for the gate.
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
    console.error("✘ Could not parse expected tab counts from architectural design.");
    console.error("  Confirm IH35_ARCHITECTURAL_DESIGN.md uses the format:");
    console.error("    N. MODULE NAME (X tabs)");
    process.exit(1);
  }

  const failures: string[] = [];
  const warnings: string[] = [];

  for (const mod of expected) {
    // DRIVER PWA is a separate app; skip from this check.
    if (mod.name.includes("DRIVER PWA")) continue;

    const dirName = MODULE_DIR_MAP[mod.name];
    if (!dirName) {
      warnings.push(`⚠ No frontend dir mapping for module: ${mod.name} (add to MODULE_DIR_MAP)`);
      continue;
    }
    const actual = countActualTabs(dirName);
    if (actual === null) {
      warnings.push(`⚠ Frontend dir not found yet: ${dirName} (expected ${mod.expectedTabs} tabs) — module may not be implemented yet`);
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
    console.log("\n--- WARNINGS ---");
    warnings.forEach((w) => console.log(w));
  }

  if (failures.length > 0) {
    console.error("\n--- FAILURES ---");
    failures.forEach((f) => console.error(f));
    console.error(
      "\nFix: Either add the missing tabs to the module OR update docs/specs/IH35_ARCHITECTURAL_DESIGN.md to reflect the new design (with Jorge approval)."
    );
    process.exit(1);
  }

  console.log("\n✅ All implemented modules match architectural design");
}

main();
