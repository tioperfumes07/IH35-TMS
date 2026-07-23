#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202607790000_cost_of_labor_mexico_drivers_transp_usmca.sql";
const HELD = "db/migrations/.held-migrations.json";
export function run(root = ROOT) {
  const f = [];
  const mig = fs.readFileSync(path.join(root, MIG), "utf8");
  if (!/DO NOT RUN ON PROD/i.test(mig)) f.push("missing DO NOT RUN ON PROD");
  if (!/org\.companies c ON c\.code/.test(mig)) f.push("must resolve entity BY org.companies.code");
  if (/b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e|91e0bf0a-133f-4ce8-a734-2586cfa66d96|5c854333-6ea5-4faa-af31-67cb272fef80/.test(mig)) {
    f.push("must NOT hardcode company UUIDs");
  }
  if (!/'TRANSP'/.test(mig) || !/'USMCA'/.test(mig)) f.push("must target TRANSP and USMCA");
  if (!/Cost of Labor/.test(mig)) f.push("must seed Cost of Labor–Mexico Drivers name");
  if (!/OWNER\+CPA|OWNER\+CPA CONFIRM|NEEDS OWNER\+CPA/i.test(mig)) f.push("must flag OWNER+CPA confirm for account numbers");
  // Numbers must not invent QBO-* for TRANSP/USMCA in VALUES (NULL ok)
  if (/VALUES[\s\S]*'TRANSP'[\s\S]*'QBO-/.test(mig)) f.push("must not invent TRANSP account_number without CPA confirm");
  const held = JSON.parse(fs.readFileSync(path.join(root, HELD), "utf8"));
  if (!(held.held || []).some((h) => h.file === path.basename(MIG))) f.push("must register held");
  return f;
}
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const tmp = fs.mkdtempSync("/tmp/verify-col-");
    for (const rel of [MIG, HELD]) fs.mkdirSync(path.join(tmp, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(tmp, MIG), "INSERT hardcoded uuid");
    fs.writeFileSync(path.join(tmp, HELD), JSON.stringify({ held: [] }));
    if (!run(tmp).length) throw new Error("bug must fail");
    fs.writeFileSync(path.join(tmp, MIG), "-- DO NOT RUN ON PROD\n-- NEEDS OWNER+CPA CONFIRM\nJOIN org.companies c ON c.code = v.company_code\nVALUES ('TRANSP', NULL, 'Cost of Labor–Mexico Drivers'), ('USMCA', NULL, 'Cost of Labor–Mexico Drivers')");
    fs.writeFileSync(path.join(tmp, HELD), JSON.stringify({ held: [{ file: path.basename(MIG) }] }));
    if (run(tmp).length) throw new Error("good must pass " + run(tmp));
    console.log("verify-cost-of-labor-seed-transp-usmca --selftest OK");
  } else {
    const r = run();
    if (r.length) { console.error(r.join("\n")); process.exit(1); }
    console.log("verify-cost-of-labor-seed-transp-usmca — OK");
  }
}
