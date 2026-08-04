#!/usr/bin/env node
/**
 * LST-LINK-02 — WO cancel modals must use shared Combobox (options API) wired to
 * catalogs.wo_cancellation_reasons; backend cancel route validates reason_code.
 * Cursor even claim: 2362.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wo-cancel-reason-combobox";

const PAGES = [
  "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx",
  "apps/frontend/src/pages/work-orders/WorkOrdersConsoleDetailPage.tsx",
];
const ROUTES = "apps/backend/src/work-orders/work-orders.routes.ts";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];

  for (const rel of PAGES) {
    const src = readRel(root, rel);
    if (!src) {
      problems.push(`missing ${rel}`);
      continue;
    }
    if (!/from ["'][^"']*\/shared\/Combobox["']/.test(src)) {
      problems.push(`${rel}: must import shared Combobox for cancel reason`);
    }
    if (/SelectCombobox[\s\S]{0,300}woCancelReasonOptions/.test(src)) {
      problems.push(`${rel}: must not pass woCancelReasonOptions to SelectCombobox (use Combobox)`);
    }
    if (!/Combobox[\s\S]{0,400}woCancelReasonOptions/.test(src)) {
      problems.push(`${rel}: cancel reason must use Combobox with woCancelReasonOptions`);
    }
    if (!/onChange=\{setCancelReasonCode\}/.test(src)) {
      problems.push(`${rel}: Combobox onChange must be setCancelReasonCode (string|null)`);
    }
  }

  const routes = readRel(root, ROUTES);
  if (!routes) problems.push(`missing ${ROUTES}`);
  else {
    if (!/catalogs\.wo_cancellation_reasons/.test(routes)) {
      problems.push(`${ROUTES}: cancel route must validate against catalogs.wo_cancellation_reasons`);
    }
    const cancelBlock = routes.match(
      /cancelBodySchema[\s\S]{0,4000}reasonRow = await client\.query\([\s\S]{0,600}\)/
    );
    if (cancelBlock && /client\.query\s*</.test(cancelBlock[0])) {
      problems.push(`${ROUTES}: cancel reasonRow must not use client.query<T> inside withCompanyScope (TS2347)`);
    }
  }

  return problems;
}

function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--selftest")) {
    const tmp = fs.mkdtempSync(path.join(ROOT, ".verify-wo-cancel-selftest-"));
    try {
      for (const rel of PAGES) {
        const good = readRel(ROOT, rel);
        if (good) {
          const dest = path.join(tmp, rel);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, good, "utf8");
        }
      }
      const goodRoutes = readRel(ROOT, ROUTES);
      if (goodRoutes) {
        const dest = path.join(tmp, ROUTES);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, goodRoutes, "utf8");
      }

      const pass = collectProblems(tmp);
      if (pass.length) {
        console.error(`${LABEL} --selftest PASS probe failed: expected [], got ${JSON.stringify(pass)}`);
        process.exit(1);
      }

      const badPage = readRel(ROOT, PAGES[0]);
      if (badPage) {
        const broken = badPage.replace(
          "<Combobox",
          "<SelectCombobox"
        );
        const dest = path.join(tmp, PAGES[0]);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, broken, "utf8");
      }
      const fail = collectProblems(tmp);
      if (!fail.some((p) => p.includes("SelectCombobox"))) {
        console.error(`${LABEL} --selftest FAIL probe did not detect SelectCombobox regression`);
        process.exit(1);
      }
      console.log(`${LABEL} --selftest OK`);
      process.exit(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAILED:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK`);
}

main();
