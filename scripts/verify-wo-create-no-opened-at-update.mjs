#!/usr/bin/env node
/**
 * LV-WO-CREATE-500-OPENED-AT — work order creation must not trip the
 * `opened_at` immutability trigger by re-setting the column in the post-insert
 * UPDATE that follows the initial INSERT.
 *
 * The INSERT already sets opened_at from service_date (or now()). The render-v5
 * header UPDATE must therefore leave opened_at out of its SET list, and the
 * guard prevents a future refactor from re-adding it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/backend/src/maintenance/two-section-service.ts";

function read() {
  return fs.readFileSync(path.join(ROOT, FILE), "utf8");
}

function assert(cond, msg, errors) {
  if (!cond) errors.push(`${FILE}: ${msg}`);
}

export function run() {
  const src = read();
  const errors = [];

  // Locate the render-v5 post-insert UPDATE block (the second UPDATE after the VMRS block).
  const match = src.match(/UPDATE maintenance\.work_orders[\s\S]*?WHERE id = \$\d/s);
  assert(match != null, "must contain a post-insert UPDATE on maintenance.work_orders", errors);
  const updateBlock = match?.[0] ?? "";

  assert(
    !updateBlock.includes("opened_at"),
    "post-insert UPDATE must not set opened_at (trigger forbids changing it)",
    errors
  );
  assert(
    /INSERT INTO maintenance\.work_orders\s*\([\s\S]*?opened_at[\s\S]*?\)\s*VALUES/s.test(src),
    "INSERT must still include opened_at (so the column is populated at creation)",
    errors
  );

  return errors;
}

function selftest() {
  const p = path.join(ROOT, FILE);
  const backup = fs.readFileSync(p, "utf8");
  try {
    const planted = backup.replace(
      /(UPDATE maintenance\.work_orders\s*SET)([\s\S]*?)(WHERE id = \$\d)/s,
      (all, set, body, where) => {
        if (!body.includes("opened_at = COALESCE")) {
          return `${set}\n             opened_at = COALESCE($8, opened_at),${body}${where}`;
        }
        return all;
      }
    );
    fs.writeFileSync(p, planted, "utf8");
    const plantedErrors = run();
    if (!plantedErrors.some((e) => e.includes("opened_at"))) {
      console.error("verify-wo-create-no-opened-at-update: SELFTEST FAIL — planted opened_at SET was not detected");
      process.exit(1);
    }
    console.log(`verify-wo-create-no-opened-at-update: SELFTEST PASS (${plantedErrors.length} planted failures detected)`);
  } finally {
    fs.writeFileSync(p, backup, "utf8");
  }
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = run();
  if (errors.length) {
    console.error("verify-wo-create-no-opened-at-update: FAIL");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("verify-wo-create-no-opened-at-update: OK — post-insert UPDATE does not touch opened_at");
}

main();
