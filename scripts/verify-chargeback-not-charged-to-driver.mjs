#!/usr/bin/env node
/**
 * ND-C5-01 — factoring chargebacks are absorbed by the COMPANY, never the driver.
 *
 * VERIFY-ONLY proof for OWNER-DECISIONS C5 (Upload-4). Claude traced the poster as already
 * correct; this guard locks the invariant so a future "charge the driver" path cannot land.
 *
 * FAIL if any factoring chargeback / Faro recourse posting path references:
 *   - driver_finance.driver_settlement_deductions / createSettlementDeduction
 *   - driver_liabilities (driver A/R / payroll liability recovery)
 *   - abandonment_chargebacks wired FROM a factoring chargeback poster (different concept —
 *     abandonment recovery may exist elsewhere; it must not be invoked from factoring chargeback)
 *
 * Modes: default static scan · --selftest · (no --live required — policy is code-shape)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SCAN_ROOTS = [
  "apps/backend/src/accounting/factoring-posting",
  "apps/backend/src/factoring",
];

/** Files that implement Faro/factoring chargeback or day-95 recourse money paths. */
const CHARGEBACK_FILE_HINTS = [
  /poster\.service\.ts$/,
  /default-interest\.service\.ts$/,
  /faro-csv-import\.ts$/,
  /chargeback/i,
];

const FORBIDDEN = [
  {
    id: "SETTLEMENT_DEDUCTION",
    re: /createSettlementDeduction|driver_settlement_deductions/i,
    why: "factoring chargeback must not write a driver settlement deduction",
  },
  {
    id: "DRIVER_LIABILITY",
    re: /driver_liabilit/i,
    why: "factoring chargeback must not post to driver_liabilities",
  },
  {
    id: "ABANDONMENT_FROM_FACTORING",
    re: /abandonment_chargeback/i,
    why: "abandonment_chargebacks is a different concept — must not be invoked from factoring chargeback",
  },
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "__tests__" || ent.name === "node_modules") continue;
      walk(p, out);
    } else if (ent.isFile() && ent.name.endsWith(".ts") && !ent.name.endsWith(".test.ts")) {
      out.push(p);
    }
  }
  return out;
}

export function isChargebackPathFile(relPath) {
  return CHARGEBACK_FILE_HINTS.some((re) => re.test(relPath));
}

export function findDriverChargeProblems(files) {
  const problems = [];
  for (const abs of files) {
    const rel = path.relative(ROOT, abs).replaceAll("\\", "/");
    if (!isChargebackPathFile(rel)) continue;
    const src = fs.readFileSync(abs, "utf8");
    // Only flag inside chargeback-named functions when scanning poster (large file).
    const scopes =
      /poster\.service\.ts$/.test(rel)
        ? extractFunctions(src, /postFactoringChargeback|applyChargeback|loadExactLinkedChargeback/i)
        : [{ name: rel, body: src }];
    for (const scope of scopes) {
      for (const rule of FORBIDDEN) {
        if (rule.re.test(scope.body)) {
          problems.push(`${rel} :: ${scope.name} — ${rule.id}: ${rule.why}`);
        }
      }
    }
  }
  return problems;
}

function extractFunctions(src, nameRe) {
  const out = [];
  const re = /(?:export\s+)?async\s+function\s+(\w+)/g;
  let m;
  const starts = [];
  while ((m = re.exec(src))) {
    starts.push({ name: m[1], index: m.index });
  }
  for (let i = 0; i < starts.length; i++) {
    const cur = starts[i];
    if (!nameRe.test(cur.name)) continue;
    const end = i + 1 < starts.length ? starts[i + 1].index : src.length;
    out.push({ name: cur.name, body: src.slice(cur.index, end) });
  }
  // If no named fn matched, fall back to whole file (still scanned).
  if (!out.length && nameRe.test(src)) out.push({ name: "(file)", body: src });
  return out;
}

function collectScanFiles(root = ROOT) {
  const files = [];
  for (const rel of SCAN_ROOTS) {
    walk(path.join(root, rel), files);
  }
  return files;
}

function selftest() {
  const tmpDir = fs.mkdtempSync(path.join(ROOT, "tmp-nd-c5-"));
  try {
    const bad = path.join(tmpDir, "poster.service.ts");
    fs.writeFileSync(
      bad,
      `
export async function postFactoringChargebackEvent(input) {
  await createSettlementDeduction({ driverId: input.driver_id, amount: input.cents });
  await client.query("INSERT INTO driver_finance.driver_liabilities ...");
}
`,
    );
    const planted = findDriverChargeProblems([bad]);
    if (planted.length < 2) {
      throw new Error(`selftest: planted driver-charge path under-caught (${planted.join("; ")})`);
    }

    const goodFiles = collectScanFiles();
    const liveProblems = findDriverChargeProblems(goodFiles);
    if (liveProblems.length) {
      throw new Error(`selftest: live tree already violates ND-C5: ${liveProblems.join("; ")}`);
    }
    console.log("[verify-chargeback-not-charged-to-driver] SELFTEST PASS");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--selftest")) {
    selftest();
    return;
  }
  const problems = findDriverChargeProblems(collectScanFiles());
  if (problems.length) {
    console.error("[verify-chargeback-not-charged-to-driver] FAIL:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(
    "[verify-chargeback-not-charged-to-driver] PASS — factoring chargeback paths do not charge the driver (ND-C5)",
  );
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) main();
