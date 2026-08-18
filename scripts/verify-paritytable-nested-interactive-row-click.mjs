#!/usr/bin/env node
/**
 * LINK-F5171-PARITYTABLE-NESTED-DRILL
 *
 * A ParityTable row may open its record, but nested links/buttons/inputs must retain their own
 * navigation/action. This guards the shared root fix so customer/load/vendor EntityLinks cannot be
 * overwritten by the row click across any consuming module.
 *
 * --selftest proves the guard rejects both a missing interactive selector and an unconditional row
 * navigation mutation.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "apps/frontend/src/components/parity/ParityTable.tsx");

function audit(source) {
  const problems = [];
  for (const token of ["a", "button", "input", "select", "textarea", "[role='button']", "[role='link']"]) {
    if (!source.includes(token)) problems.push(`interactive selector lost ${token}`);
  }
  if (!/isParityTableInteractiveTarget\(event\.target\)/.test(source)) {
    problems.push("row click no longer checks the actual event target");
  }
  if (!/if \(isParityTableInteractiveTarget\(event\.target\)\) return;[\s\S]{0,100}onRowClick\(row\)/.test(source)) {
    problems.push("nested controls no longer short-circuit before row navigation");
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const good = `
    const S = "a, button, input, select, textarea, [role='button'], [role='link']";
    function isParityTableInteractiveTarget(target) { return target.closest(S); }
    onClick={(event) => { if (isParityTableInteractiveTarget(event.target)) return; onRowClick(row); }}
  `;
  const cases = [
    ["good", good, 0],
    ["missing-link", good.replace(", [role='link']", ""), 1],
    ["unconditional-row", good.replace("if (isParityTableInteractiveTarget(event.target)) return; ", ""), 1],
  ];
  const failed = cases.filter(([, source, min]) => (min === 0 ? audit(source).length !== 0 : audit(source).length < min));
  if (failed.length) {
    console.error(`verify-paritytable-nested-interactive-row-click SELFTEST FAIL: ${failed.map(([name]) => name).join(", ")}`);
    process.exit(1);
  }
  console.log("verify-paritytable-nested-interactive-row-click SELFTEST PASS — planted mutations rejected");
  process.exit(0);
}

const problems = audit(fs.readFileSync(TARGET, "utf8"));
if (problems.length) {
  console.error(`verify-paritytable-nested-interactive-row-click FAIL:\n${problems.map((p) => `- ${p}`).join("\n")}`);
  process.exit(1);
}

console.log("verify-paritytable-nested-interactive-row-click PASS — nested controls win over shared row navigation");
