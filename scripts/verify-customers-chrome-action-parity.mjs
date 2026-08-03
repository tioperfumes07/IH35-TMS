#!/usr/bin/env node
/**
 * CHROME-001 / CUST-CHROME-01 — Customers list-detail actions:
 * - "New transaction" = primary Button (Vendors sibling)
 * - "Edit" = Button variant="secondary" h-8 (same chrome family as primary — not ActionButton text-link)
 * Prevents disproportion regression (ActionButton 24×16 beside primary Button).
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

function newTransactionHost(src) {
  const idx = src.indexOf("New transaction");
  if (idx < 0) return null;
  const before = src.slice(Math.max(0, idx - 280), idx);
  const after = src.slice(idx, idx + 80);
  if (/<\/Button>\s*$/m.test(after) || after.includes("</Button>")) {
    if (/<Button\b[\s\S]*$/.test(before)) return "Button";
  }
  if (after.includes("</ActionButton>") && /<ActionButton\b[\s\S]*$/.test(before)) return "ActionButton";
  const openBtn = before.lastIndexOf("<Button");
  const openAct = before.lastIndexOf("<ActionButton");
  if (openBtn > openAct && openBtn >= 0) return "Button";
  if (openAct > openBtn && openAct >= 0) return "ActionButton";
  return null;
}

function editIsSecondaryButton(src, testId) {
  // Attr order varies; window must cover onClick={() => navigate(`/…/${id}`)} between variant and testid.
  const re = new RegExp(
    `variant="secondary"[\\s\\S]{0,400}data-testid="${testId}"[\\s\\S]{0,80}>\\s*Edit\\s*<\\/Button>`,
  );
  const reRev = new RegExp(
    `data-testid="${testId}"[\\s\\S]{0,400}variant="secondary"[\\s\\S]{0,80}>\\s*Edit\\s*<\\/Button>`,
  );
  return re.test(src) || reRev.test(src);
}

export function collectProblems(sources = { customers: read(CUSTOMERS), vendors: read(VENDORS) }) {
  const problems = [];
  const c = stripComments(sources.customers);
  const v = stripComments(sources.vendors);

  if (!/import\s*\{\s*Button\s*\}\s*from\s*["']\.\.\/components\/Button["']/.test(sources.customers)) {
    problems.push(`${CUSTOMERS}: must import Button from ../components/Button`);
  }

  const cHost = newTransactionHost(c);
  if (cHost !== "Button") {
    problems.push(`${CUSTOMERS}: New transaction must render via <Button> (Vendors parity); got ${cHost ?? "none"}`);
  }

  if (!editIsSecondaryButton(c, "customer-header-edit")) {
    problems.push(
      `${CUSTOMERS}: Edit must be Button variant="secondary" (data-testid=customer-header-edit) — not ActionButton text-link`,
    );
  }
  if (/data-testid="customer-header-edit"[\s\S]{0,200}<\/ActionButton>/.test(c)) {
    problems.push(`${CUSTOMERS}: Edit must not use ActionButton`);
  }

  const vHost = newTransactionHost(v);
  if (vHost !== "Button") {
    problems.push(`${VENDORS}: New transaction must stay on <Button> (sibling baseline); got ${vHost ?? "none"}`);
  }
  if (!editIsSecondaryButton(v, "vendor-header-edit")) {
    problems.push(`${VENDORS}: Edit must stay Button variant="secondary" (sibling baseline)`);
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
        /data-testid="customer-header-edit"[\s\S]*?<\/Button>/,
        `data-testid="customer-header-edit"><ActionButton onClick={() => setEditOpen(true)}>Edit</ActionButton>`,
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
  console.log(
    `${LABEL} PASS — Customers/Vendors New transaction=Button; Edit=Button secondary (CUST-CHROME-01)`,
  );
}
