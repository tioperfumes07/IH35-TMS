import fs from "node:fs";
import path from "node:path";

// CODER-28B (GL idempotency backstop): every INSERT INTO accounting.journal_entry_postings should
// carry an idempotency_key so the partial unique index uq_jep_company_idempotency_line
// (operating_company_id, idempotency_key, line_sequence) can block a line-level double-post. This
// guard FAILS if a NEW poster omits idempotency_key from its column list — a key-less insert writes
// NULL, which the partial index does not cover, leaving that GL path unprotected against a retry.
//
// BLOCK 2 (2026-06-29) CLEARED the grandfather list: the four formerly key-less posters (manual JE,
// void, recurring, period-close) now set deterministic idempotency keys + ON CONFLICT DO NOTHING, so
// EVERY journal_entry_postings INSERT carries a key. The allowlist is intentionally empty — any
// key-less insert (existing posters included) now fails the guard. Do NOT re-add entries here.
const KEYLESS_BY_DESIGN = new Set([]);

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
