#!/usr/bin/env node
/**
 * CHROME-001 — Customers list-detail "New transaction" must use primary Button
 * (same as Vendors), not ActionButton with a solid className pile-on.
 * Edit stays ActionButton (text-link). Prevents disproportion regression.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CUSTOMERS = "apps/frontend/src/pages/Customers.tsx";
const VENDORS = "apps/frontend/src/pages/Vendors.tsx";
const LABEL = "verify-customers-chrome-action-parity";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

export function collectProblems(sources = { customers: read(CUSTOMERS), vendors: read(VENDORS) }) {
  const problems = [];
  const c = stripComments(sources.customers);
  const v = stripComments(sources.vendors);

  if (!/import\s*\{\s*Button\s*\}\s*from\s*["']\.\.\/components\/Button["']/.test(sources.customers)) {
    problems.push(`${CUSTOMERS}: must import Button from ../components/Button`);
  }
  if (!/import\s*\{\s*ActionButton\s*\}/.test(sources.customers)) {
    problems.push(`${CUSTOMERS}: must keep ActionButton for Edit`);
  }

  // New transaction must be <Button …>…New transaction…</Button> (not ActionButton).
  // Note: attrs contain `=>` so do not use [^>]* for the open tag.
  function newTransactionHost(src) {
    const idx = src.indexOf("New transaction");
    if (idx < 0) return null;
    const before = src.slice(Math.max(0, idx - 280), idx);
    const after = src.slice(idx, idx + 80);
    if (/<\/Button>\s*$/m.test(after) || after.includes("</Button>")) {
      if (/<Button\b[\s\S]*$/.test(before)) return "Button";
    }
    if (after.includes("</ActionButton>") && /<ActionButton\b[\s\S]*$/.test(before)) return "ActionButton";
    // Fallback: nearest open tag before the label
    const openBtn = before.lastIndexOf("<Button");
    const openAct = before.lastIndexOf("<ActionButton");
    if (openBtn > openAct && openBtn >= 0) return "Button";
    if (openAct > openBtn && openAct >= 0) return "ActionButton";
    return null;
  }

  const cHost = newTransactionHost(c);
  if (cHost !== "Button") {
    problems.push(`${CUSTOMERS}: New transaction must render via <Button> (Vendors parity); got ${cHost ?? "none"}`);
  }

  // Edit remains ActionButton
  const editIdx = c.indexOf(">Edit</ActionButton>");
  if (editIdx < 0 && !/<ActionButton\b[\s\S]{0,120}>\s*Edit\s*<\/ActionButton>/.test(c)) {
    problems.push(`${CUSTOMERS}: Edit must remain ActionButton`);
  }

  // Sibling law: Vendors already correct — fail closed if Vendors regresses
  const vHost = newTransactionHost(v);
  if (vHost !== "Button") {
    problems.push(`${VENDORS}: New transaction must stay on <Button> (sibling baseline); got ${vHost ?? "none"}`);
  }

  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const real = { customers: read(CUSTOMERS), vendors: read(VENDORS) };
  const broken = {
    ...real,
    customers: real.customers
      .replace(/import \{ Button \} from "\.\.\/components\/Button";\n?/, "")
      .replace(
        /<Button type="button" onClick=\{\(\) => navigate\(`\/accounting\/invoices\?customer_id=\$\{selectedCustomer\.id\}`\)\}>\s*New transaction\s*<\/Button>/,
        `<ActionButton className="rounded-sm border border-[#1f2a44] bg-[#1f2a44] px-3 py-1 text-white" onClick={() => navigate(\`/accounting/invoices?customer_id=\${selectedCustomer.id}\`)}>
                        New transaction
                      </ActionButton>`
      ),
  };
  if (collectProblems(broken).length === 0) {
    console.error(`${LABEL} --selftest FAIL: broken fixture not flagged`);
    process.exit(1);
  }
  const good = collectProblems(real);
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL:\n${good.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

if (IS_MAIN) {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — Customers New transaction uses Button; Edit stays ActionButton (Vendors parity)`);
}
