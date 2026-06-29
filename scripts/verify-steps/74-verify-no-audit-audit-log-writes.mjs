import fs from "node:fs";
import path from "node:path";

// CODER-12 (audit-spine trustworthiness): audit.audit_log DOES NOT EXIST (GUARD prod-verified) —
// the canonical audit sink is audit.audit_events. Two writers (owner/todays-attention,
// reports/ifta/quarterly-preparer) used to INSERT INTO audit.audit_log → events SILENTLY LOST;
// CC-07 (#1587) repointed them to audit.audit_events. This guard BANS any DML targeting
// audit.audit_log so the silent-loss class can never recur.
//
// Matches INSERT INTO / FROM / UPDATE / JOIN audit.audit_log used as a table. Excludes the real
// public.audit_log_YYYY_MM partition tables (the `(?!_)` lookahead) and prose comments (a DML
// keyword must immediately precede the relation).
const DML_RE = /\b(?:INSERT\s+INTO|FROM|UPDATE|JOIN|INTO)\s+audit\.audit_log\b(?!_)/gi;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "__tests__") continue;
      out.push(...walk(full));
    } else if (/\.(ts|mts|cts)$/.test(entry) && !/\.(test|spec)\.[cm]?ts$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

export default {
  name: "verify-no-audit-audit-log-writes",
  run: async () => {
    const backend = path.resolve("apps/backend/src");
    const hits = [];
    for (const file of walk(backend)) {
      const src = fs.readFileSync(file, "utf8");
      DML_RE.lastIndex = 0;
      if (DML_RE.test(src)) hits.push(path.relative(process.cwd(), file));
    }
    if (hits.length) {
      console.error("verify-no-audit-audit-log-writes FAILED — audit.audit_log does not exist; writes are silently lost.");
      console.error("Use the canonical sink audit.audit_events (appendCrudAudit). Offending files:");
      for (const h of hits) console.error("  " + h);
      process.exit(1);
    }
    console.log("verify-no-audit-audit-log-writes OK — no DML targets the non-existent audit.audit_log.");
  },
};
