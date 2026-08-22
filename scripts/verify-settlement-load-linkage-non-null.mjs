#!/usr/bin/env node
/** Settlement load/driver-bill lineage — production-source mutation guard. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const FILES = {
  bookended: "apps/backend/src/driver-finance/settlements-load-bookended.service.ts",
  engine: "apps/backend/src/driver-finance/settlement-engine.ts",
};

export function run(root = process.cwd()) {
  const bookended = fs.readFileSync(path.join(root, FILES.bookended), "utf8");
  const engine = fs.readFileSync(path.join(root, FILES.engine), "utf8");
  const errors = [];
  const requireMatch = (source, pattern, message) => {
    if (!pattern.test(source)) errors.push(message);
  };

  const openInsert = bookended.match(/INSERT INTO driver_finance\.driver_settlements \([\s\S]*?RETURNING id, display_id/)?.[0] ?? "";
  if (!/settlement_model,\s*first_load_id,\s*first_load_number,/.test(openInsert) || !/'load_bookended',\$6,\$7,\$8::timestamptz,\$9/.test(openInsert)) {
    errors.push("open settlement must persist first load id+number in aligned values");
  }
  requireMatch(bookended, /\[\s*opts\.operatingCompanyId,[\s\S]*?opts\.firstLoadId,[\s\S]*?load\.load_number,[\s\S]*?tripStartedAt,/, "open settlement must bind the selected first load id+number");
  requireMatch(bookended, /SET trip_closed_at = \$2::timestamptz,[\s\S]*?last_load_id = \$3,[\s\S]*?last_load_number = \$4,[\s\S]*?WHERE id = \$1/, "close settlement must persist last load id+number on the selected settlement");
  requireMatch(bookended, /\[settlementId, closedAt, opts\.load\.id, opts\.load\.load_number\]/, "close settlement must bind the selected last load id+number");
  requireMatch(engine, /table_name = 'settlement_lines'[\s\S]*?column_name = 'source_driver_bill_id'/, "engine must capability-check canonical source_driver_bill_id");
  const sourceColumnCount = engine.match(/\n\s+source_driver_bill_id\$\{loadCols\.join\(""\)\}/g)?.length ?? 0;
  if (sourceColumnCount !== 2) errors.push(`both team and solo settlement-line writers must persist source_driver_bill_id (expected 2, found ${sourceColumnCount})`);
  const billBindingCount = engine.match(/bill\.id, \.\.\.loadParam/g)?.length ?? 0;
  if (billBindingCount !== 2) errors.push(`both team and solo settlement-line writers must bind the canonical driver bill id (expected 2, found ${billBindingCount})`);
  const conflictCount = engine.match(/ON CONFLICT \(source_driver_bill_id\) WHERE source_driver_bill_id IS NOT NULL DO NOTHING/g)?.length ?? 0;
  if (conflictCount !== 2) errors.push(`both source-driver-bill writers must be idempotent (expected 2, found ${conflictCount})`);
  requireMatch(bookended, /COALESCE\(db\.load_id, sl\.load_id\)[\s\S]*?LEFT JOIN driver_finance\.driver_bills db ON db\.id = sl\.source_driver_bill_id/, "settlement rollup must resolve canonical driver-bill load before denormalized line load");
  return errors;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verify-settlement-load-linkage-"));
  const originals = new Map(Object.values(FILES).map((rel) => [rel, fs.readFileSync(path.join(process.cwd(), rel), "utf8")]));
  const reset = () => originals.forEach((body, rel) => {
    const target = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
  });
  reset();
  if (run(tmp).length) throw new Error(`production copy failed: ${run(tmp).join("; ")}`);
  const plants = [
    [FILES.bookended, "settlement_model,\n        first_load_id,", "settlement_model,\n        wrong_first_load_id,"],
    [FILES.bookended, "periodDate,\n      opts.firstLoadId,\n      load.load_number,", "periodDate,\n      null,\n      load.load_number,"],
    [FILES.bookended, "last_load_id = $3,", "last_load_id = NULL,"],
    [FILES.bookended, "[settlementId, closedAt, opts.load.id, opts.load.load_number]", "[settlementId, closedAt, null, null]"],
    [FILES.engine, "column_name = 'source_driver_bill_id'", "column_name = 'wrong_source_id'"],
    [FILES.engine, 'source_driver_bill_id${loadCols.join("")}', 'wrong_source_driver_bill_id${loadCols.join("")}' ],
    [FILES.engine, "bill.id, ...loadParam", "null, ...loadParam"],
    [FILES.engine, "ON CONFLICT (source_driver_bill_id) WHERE source_driver_bill_id IS NOT NULL DO NOTHING", "ON CONFLICT DO NOTHING"],
    [FILES.bookended, "COALESCE(db.load_id, sl.load_id) AS load_id", "sl.load_id AS load_id"],
  ];
  let rejected = 0;
  for (const [rel, needle, replacement] of plants) {
    reset();
    const source = originals.get(rel);
    if (!source.includes(needle)) throw new Error(`plant drift: ${rel} missing ${needle}`);
    fs.writeFileSync(path.join(tmp, rel), source.replace(needle, replacement));
    if (!run(tmp).length) throw new Error(`mutation escaped: ${rel} :: ${needle}`);
    rejected += 1;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`verify-settlement-load-linkage-non-null SELFTEST PASS — ${rejected}/${plants.length} production defects rejected`);
} else {
  const errors = run();
  if (errors.length) {
    errors.forEach((error) => console.error(`FAIL: ${error}`));
    process.exit(1);
  }
  console.log("verify-settlement-load-linkage-non-null PASS — load bookends and driver-bill lineage are exact");
}
