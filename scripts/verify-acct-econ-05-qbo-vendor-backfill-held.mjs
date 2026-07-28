#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202610121800_acct_econ_05_qbo_vendors_canonical_backfill.sql";
const HELD = "db/migrations/.held-migrations.json";
const LABEL = "verify-acct-econ-05-qbo-vendor-backfill-held";
const mig = fs.readFileSync(path.join(ROOT, MIG), "utf8");
const held = JSON.parse(fs.readFileSync(path.join(ROOT, HELD), "utf8"));
const problems = [];
if (!/HOLD-FOR-JORGE/i.test(mig)) problems.push("mig missing HOLD-FOR-JORGE");
if (!/INSERT INTO accounting\.qbo_vendors/i.test(mig)) problems.push("mig must INSERT into accounting.qbo_vendors");
if (/DROP TABLE/i.test(mig)) problems.push("mig must never DROP");
if (!/mdata\.qbo_vendors/i.test(mig)) problems.push("mig must read RETIRE mirror as source");
const inHeld = (held.held || []).some((e) => e.file === path.basename(MIG));
if (!inHeld) problems.push("mig not in held[]");
if (problems.length) {
  console.error(LABEL, "FAIL", problems);
  process.exit(1);
}
console.log(LABEL, "OK — held backfill mig present + registered");
