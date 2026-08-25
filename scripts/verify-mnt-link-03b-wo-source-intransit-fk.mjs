#!/usr/bin/env node
/**
 * MNT-LINK-03b — work_orders.source_intransit_issue_id FK to dispatch.intransit_issues
 * + convert-to-WO writers stamp the reverse link when the column is live.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-mnt-link-03b-wo-source-intransit-fk";
const SELFTEST = process.argv.includes("--selftest");
const MIG = path.join(ROOT, "db/migrations/202609100060_mnt_link_03b_wo_source_intransit_fk.sql");
const ARRIVING = path.join(ROOT, "apps/backend/src/maintenance/arriving-soon.routes.ts");
const TRIAGE = path.join(ROOT, "apps/backend/src/maintenance/triage.routes.ts");

/** @param {{ mig: string, arriving: string, triage: string }} sources */
export function check(sources) {
  const problems = [];
  const { mig, arriving, triage } = sources;
  if (!mig) problems.push("missing migration 202609100060_mnt_link_03b_wo_source_intransit_fk.sql");
  else {
    if (!/HOLD-FOR-JORGE/.test(mig)) problems.push("migration must carry HOLD-FOR-JORGE");
    if (!/DO NOT RUN ON PROD/.test(mig)) problems.push("migration must carry DO NOT RUN ON PROD");
    if (!/source_intransit_issue_id/.test(mig)) problems.push("must ADD source_intransit_issue_id");
    if (!/work_orders_source_intransit_issue_id_fkey/.test(mig)) {
      problems.push("must ADD CONSTRAINT work_orders_source_intransit_issue_id_fkey");
    }
    if (!/REFERENCES\s+dispatch\.intransit_issues\s*\(\s*id\s*\)/i.test(mig)) {
      problems.push("FK must REFERENCES dispatch.intransit_issues(id) — Neon-canonical");
    }
    if (/REFERENCES\s+[\w.]*(in_transit_issues)\b/i.test(mig) || /to_regclass\(\s*'[^']*in_transit_issues'/i.test(mig)) {
      problems.push("must NOT reference phantom in_transit_issues");
    }
    if (!/dangling/i.test(mig) || !/ABORT/i.test(mig)) {
      problems.push("must abort when dangling source_intransit_issue_id rows exist");
    }
  }
  for (const [label, src] of [
    ["arriving-soon.routes.ts", arriving],
    ["triage.routes.ts", triage],
  ]) {
    if (!src) {
      problems.push(`missing ${label}`);
      continue;
    }
    if (!/source_intransit_issue_id/.test(src)) {
      problems.push(`${label} must stamp source_intransit_issue_id on convert-to-WO`);
    }
    const sourceLoadStamped = label === "triage.routes.ts" ? /issue\.load_id/.test(src) : /load\.id/.test(src);
    if (!/\bload_id\b/.test(src) || !sourceLoadStamped) {
      problems.push(`${label} must preserve the in-transit issue load_id on the created WO`);
    }
  }
  return problems;
}

function read(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

function selftest() {
  const good = {
    mig: `HOLD-FOR-JORGE\nDO NOT RUN ON PROD\nABORT dangling\nADD COLUMN source_intransit_issue_id\nADD CONSTRAINT work_orders_source_intransit_issue_id_fkey\nREFERENCES dispatch.intransit_issues(id)`,
    arriving: `load_id source_intransit_issue_id load.id`,
    triage: `load_id source_intransit_issue_id issue.load_id`,
  };
  const bad = {
    mig: `REFERENCES dispatch.in_transit_issues(id)`,
    arriving: `INSERT INTO maintenance.work_orders`,
    triage: `INSERT INTO maintenance.work_orders`,
  };
  if (check(good).length) throw new Error(`${LABEL} selftest: compliant flagged`);
  if (!check(bad).length) throw new Error(`${LABEL} selftest: phantom / missing reverse stamp not caught`);
  console.log(`[${LABEL}] SELFTEST PASS`);
}

if (SELFTEST) {
  selftest();
  process.exit(0);
}

const problems = check({ mig: read(MIG), arriving: read(ARRIVING), triage: read(TRIAGE) });
if (problems.length) {
  console.error(`[${LABEL}] FAILED:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — WO↔intransit reverse FK + convert writers`);
