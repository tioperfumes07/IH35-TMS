import fs from "node:fs";
import path from "node:path";

// CODER-28B (GL idempotency backstop): every INSERT INTO accounting.journal_entry_postings should
// carry an idempotency_key so the partial unique index uq_jep_company_idempotency_line
// (operating_company_id, idempotency_key, line_sequence) can block a line-level double-post. This
// guard FAILS if a NEW poster omits idempotency_key from its column list — a key-less insert writes
// NULL, which the partial index does not cover, leaving that GL path unprotected against a retry.
//
// GRANDFATHERED (key-less BY DESIGN, surfaced in the CODER-28B PR for Jorge): four existing posters
// insert with a NULL idempotency_key. They have no machine-retry idempotency token today; adding
// deterministic keys to those money paths is a separate, reviewed follow-up (do NOT silently expand
// scope). They are allowlisted here so the ratchet protects against regression without forcing an
// in-PR change to working ledger writers.
const KEYLESS_BY_DESIGN = new Set([
  "apps/backend/src/accounting/journal-entries.service.ts", // manual JE
  "apps/backend/src/accounting/void.service.ts", // standalone void reversal
  "apps/backend/src/accounting/recurring.worker.ts", // recurring template materialization
  "apps/backend/src/accounting/period-close-retained-earnings.service.ts", // year-end close
]);

// Capture each `INSERT INTO accounting.journal_entry_postings ( <column-list> )`. Column lists here
// are flat (no nested parens), so [^)]* reliably spans to the closing paren of the column list.
const JEP_INSERT_RE = /INSERT\s+INTO\s+accounting\.journal_entry_postings\s*\(([^)]*)\)/gi;

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
  name: "verify-jep-insert-idempotency-key",
  run: async () => {
    const backend = path.resolve("apps/backend/src");
    const offenders = [];
    for (const file of walk(backend)) {
      const rel = path.relative(process.cwd(), file);
      if (KEYLESS_BY_DESIGN.has(rel)) continue;
      const src = fs.readFileSync(file, "utf8");
      JEP_INSERT_RE.lastIndex = 0;
      let m;
      while ((m = JEP_INSERT_RE.exec(src)) !== null) {
        if (!/\bidempotency_key\b/.test(m[1])) offenders.push(rel);
      }
    }
    if (offenders.length) {
      console.error(
        "verify-jep-insert-idempotency-key FAILED — a journal_entry_postings INSERT omits idempotency_key."
      );
      console.error(
        "Every GL posting line must carry a deterministic idempotency_key (<source>:<id>) so the unique"
      );
      console.error(
        "index uq_jep_company_idempotency_line can prevent a retry from double-posting. Offending files:"
      );
      for (const o of [...new Set(offenders)]) console.error("  " + o);
      process.exit(1);
    }
    console.log(
      "verify-jep-insert-idempotency-key OK — every non-grandfathered journal_entry_postings INSERT carries idempotency_key."
    );
  },
};
