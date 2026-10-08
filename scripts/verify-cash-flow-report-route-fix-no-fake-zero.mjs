#!/usr/bin/env node
/**
 * REPORTS-F6364 — GET /api/v1/reports/cash-flow (the "Cash flow report" leaf reachable from
 * /cash-flow's own "Related" nav strip and the /reports hub) painted a fake $0.00 "Operating
 * balance" tile over any real query failure: apps/backend/src/reports/cash-flow/route-fix.ts's
 * bank-balance SUM query was wrapped in `.catch(() => ({ rows: [{ total_cents: "0" }] }))` --
 * exactly the deep-dive hunt's own named fake-$0 signature (`.catch(() => ({ rows: [{ ... 0`).
 * The frontend (CashFlowReport.tsx) already has a correct, honest `query.isError -> ListErrorState`
 * branch -- it simply never fired because the backend silently converted every failure into a
 * "successful" $0 response. This same reports/cash-flow tree already states the standard elsewhere
 * (form-425c/exhibits/exhibit-a..d.ts: "NO .catch(): fail loud, never a blank/zero exhibit") -- this
 * route just hadn't been brought into line with it yet.
 */
import fs from "node:fs";

const FILE = "apps/backend/src/reports/cash-flow/route-fix.ts";
const source = fs.readFileSync(FILE, "utf8");

function operatingBalanceBlock(text) {
  const start = text.indexOf("const operatingBalanceCents = await sumAuthoritativeDepositoryCashCents");
  const end = text.indexOf(";", start) + 1;
  return start >= 0 && end > start ? text.slice(start, end) : "";
}

function audit(text) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };

  const block = operatingBalanceBlock(text);
  need(block.length > 0, "the operatingBalanceCents query block was not found (route shape changed?)");
  need(!/\.catch\(/.test(block), "the operating-balance read must NOT be wrapped in .catch() -- a real failure must propagate, never fake $0.00");
  // Strip `//`-comment lines before checking for the fake-zero literal so this guard's own
  // explanatory comment (which necessarily quotes the banned pattern in prose) can never make a
  // mutation that re-adds the real fallback pass by accident.
  const codeOnly = text
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");
  need(!/total_cents:\s*"0"/.test(codeOnly), "no fake-zero total_cents fallback literal may remain anywhere in the file");

  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-cash-flow-report-route-fix-no-fake-zero FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const marker = "const operatingBalanceCents = await sumAuthoritativeDepositoryCashCents(client, companyId, {";
  const mutated = source.replace(
    marker,
    `const operatingBalanceCents = await sumAuthoritativeDepositoryCashCents(client, companyId, {`,
  );
  // Plant the banned fallback immediately before the statement terminator.
  const plantedSource = mutated.replace(
    /(const operatingBalanceCents = await sumAuthoritativeDepositoryCashCents\([\s\S]*?\));/,
    `$1.catch(() => ({ rows: [{ total_cents: "0" }] }));`,
  );
  if (plantedSource === mutated) throw new Error("mutation did not change the source -- test is inert");
  if (audit(plantedSource).length === 0) throw new Error("mutation escaped: re-adding the fake-zero .catch() was not caught");
  console.log("verify-cash-flow-report-route-fix-no-fake-zero SELFTEST PASS — 1/1 mutation detected");
}

console.log("verify-cash-flow-report-route-fix-no-fake-zero PASS — the bank-balance query fails loud, no fake $0.00 fallback survives");
