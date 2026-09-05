#!/usr/bin/env node
/**
 * BRD-20 guard (owner 2026-09-05): planner calendar column lines are pronounced.
 * - --rule-day is defined and darker than --th-border (pronounced, not washed out)
 * - .pg-track has repeating-linear-gradient day column lines
 * - .pg-dh day header borders use --rule-day (aligned with track lines)
 * - formatPlannerDayLabel produces MMM-DD (GLB-08, already guarded elsewhere)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

const failures = [];

const css = read("apps/frontend/src/pages/dispatch/planners/PlannerGrid.css");

// 1. --rule-day must be defined as a custom property (not just inheriting --th-border)
if (!/--rule-day:\s*var\(--planner-rule-day/.test(css)) {
  failures.push("PlannerGrid.css: --rule-day must be defined as var(--planner-rule-day, ...) with its own fallback, not just inheriting --th-border");
}

// 2. --rule-day fallback must be darker than --th-border fallback (#c7d2dc)
const ruleDayMatch = css.match(/--rule-day:\s*var\(--planner-rule-day,\s*(#[0-9a-fA-F]{6})\)/);
if (!ruleDayMatch) {
  failures.push("PlannerGrid.css: --rule-day fallback color not found or not a 6-digit hex");
} else {
  const ruleDayHex = ruleDayMatch[1];
  const thBorderMatch = css.match(/--th-border:\s*var\(--planner-th-border,\s*(#[0-9a-fA-F]{6})\)/);
  const thBorderHex = thBorderMatch ? thBorderMatch[1] : "#c7d2dc";
  // Compare luminance — pronounced means darker (lower luminance)
  const lum = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  };
  if (lum(ruleDayHex) >= lum(thBorderHex)) {
    failures.push(`PlannerGrid.css: --rule-day fallback (${ruleDayHex}) must be darker (lower luminance) than --th-border fallback (${thBorderHex}) for pronounced column lines`);
  }
}

// 3. .pg-track must have repeating-linear-gradient for day column lines
if (!/\.pg-track\s*\{[\s\S]*?repeating-linear-gradient\s*\(\s*to right/.test(css)) {
  failures.push("PlannerGrid.css: .pg-track must use repeating-linear-gradient(to right, ...) for day column lines");
}

// 4. .pg-track gradient must use --rule-day
if (!css.includes("var(--rule-day) 0 1px")) {
  failures.push("PlannerGrid.css: .pg-track repeating-linear-gradient must use var(--rule-day) for the line color");
}

// 5. .pg-dh day header borders must use --rule-day (aligned with track)
const dhMatch = css.match(/\.pg-dh\s*\{[^}]*\}/);
if (!dhMatch || !dhMatch[0].includes("border-left: 1px solid var(--rule-day)")) {
  failures.push("PlannerGrid.css: .pg-dh border-left must use var(--rule-day) to align with track column lines");
}

if (failures.length) {
  console.error("FAIL verify-planner-column-lines:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("PASS verify-planner-column-lines — pronounced day column lines (BRD-20)");
