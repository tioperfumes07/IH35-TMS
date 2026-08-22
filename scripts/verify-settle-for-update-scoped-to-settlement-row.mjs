#!/usr/bin/env node
/**
 * SETL-F5900 — the /settle handler's row lock must never be an unscoped `FOR UPDATE` spanning
 * the LEFT JOIN identity.users u (the nullable side: a driver need not have a linked
 * identity_user_id). Postgres rejects that at parse time ("FOR UPDATE cannot be applied to the
 * nullable side of an outer join"), 500ing every settlement close.
 *
 * Live-reproduced 2026-08-22 (Neon, rollback-wrapped, real prod row Pedro / S-20260816-0168):
 * the exact unscoped `FOR UPDATE` query threw that same Postgres error; `FOR UPDATE OF s`
 * against the identical row succeeded and rolled back cleanly.
 */
import fs from "node:fs";

const LABEL = "verify-settle-for-update-scoped-to-settlement-row";
const FILE = "apps/backend/src/driver-finance/pre-settlement.routes.ts";
const checks = [
  [
    /FROM driver_finance\.driver_settlements s\s*\n\s*JOIN mdata\.drivers d ON d\.id = s\.driver_id[\s\S]{0,400}LEFT JOIN identity\.users u ON u\.id = d\.identity_user_id[\s\S]{0,1200}FOR UPDATE OF s/,
    "the settle-row lock query scopes FOR UPDATE to s, excluding the nullable-side identity.users join",
  ],
  [
    /FOR UPDATE OF s\s*\n\s*`,/,
    "FOR UPDATE OF s is the terminal clause of that query (no unscoped FOR UPDATE reintroduced elsewhere in it)",
  ],
];
const src = fs.readFileSync(FILE, "utf8");
const audit = (text) => checks.filter(([re]) => !re.test(text)).map(([, msg]) => msg);
const failures = audit(src);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  for (const [re, msg] of checks) {
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    const planted = src.replace(new RegExp(re.source, flags), "/* planted SETL-F5900 defect */");
    if (planted === src || !audit(planted).includes(msg)) {
      console.error(`${LABEL} SELFTEST FAIL — plant escaped: ${msg}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} regressions rejected`);
  process.exit(0);
}
console.log(`${LABEL} PASS — settle row lock never spans the nullable side of an outer join`);
