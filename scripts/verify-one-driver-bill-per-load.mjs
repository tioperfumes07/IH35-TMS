#!/usr/bin/env node
// ROUND 326 audit A5 (CC-1) — ONE DRIVER BILL PER LOAD. Owner ruling 2026-10-02: driver pay is A/P per load, the bill
// numbered as the load, created at assignment (book-load). Fails if the historical backfill stops refusing a load that
// is already billed to a different driver (team pairs excepted), or stops treating an open bill for the same driver
// as the same bill (idempotent).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-one-driver-bill-per-load";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/backend/src/driver-finance/historical-driver-bill-backfill.service.ts";

export function problems(s) {
  const p = [];
  const w = s.indexOf("// ---- 3. WRITE THE DOCUMENT");
  const pre = s.slice(0, w);
  if (!/db\.driver_id <> \$3 AND db\.voided_at IS NULL/.test(pre) || !/is already billed to another driver/.test(pre)) p.push("the backfill must refuse a load already billed to a different driver (before it writes)");
  if (!/l\.assigned_secondary_driver_id IS NOT NULL/.test(pre)) p.push("a team load (both drivers on the load) must still allow one bill per driver");
  if (!/return \{ outcome: "already_exists", driver_bill_id: prior\.id/.test(pre)) p.push("an open bill for the same load and driver must be returned as the same bill");
  return p;
}

export function run() {
  return problems(readFileSync(path.join(ROOT, FILE), "utf8"));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = readFileSync(path.join(ROOT, FILE), "utf8");
  const own = problems(src);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plants = [
      ["no other-driver refusal", src.replace("is already billed to another driver", "is fine")],
      ["team rule dropped", src.replace("AND l.assigned_secondary_driver_id IS NOT NULL", "")],
    ];
    for (const [name, planted] of plants) {
      if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL — ${own.join("; ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — the backfill never mints a second driver bill for a load (team pairs excepted).`);
}
