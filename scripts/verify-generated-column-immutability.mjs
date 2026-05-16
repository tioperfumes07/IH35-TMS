#!/usr/bin/env node
/**
 * Informational scan: PostgreSQL STORED generated columns require IMMUTABLE expressions.
 * Flags suspicious tokens commonly rejected by the planner (not exhaustive).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIG_DIR = path.resolve(__dirname, "..", "db", "migrations");

/** Strip SQL comments for naive substring scans */
function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n\r]*/g, " ");
}

/** Balanced (...) starting at openParenIdx */
function parenBody(s, openParenIdx) {
  let depth = 1;
  let i = openParenIdx + 1;
  while (i < s.length && depth > 0) {
    const c = s[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    i++;
  }
  return { body: s.slice(openParenIdx + 1, i - 1), closeIdx: i - 1 };
}

function collectGeneratedExprs(sql, filename) {
  const out = [];
  const lower = sql.toLowerCase();
  const needle = "generated always as";
  let pos = 0;
  while (true) {
    const idx = lower.indexOf(needle, pos);
    if (idx === -1) break;
    let openParen = -1;
    for (let j = idx + needle.length; j < sql.length; j++) {
      if (sql[j] === "(") {
        openParen = j;
        break;
      }
    }
    if (openParen === -1) break;
    const { body, closeIdx } = parenBody(sql, openParen);
    out.push({ file: filename, expr: body.trim(), charIdx: openParen + 1 });
    pos = closeIdx + 1;
  }
  return out;
}

const RULES = [
  {
    id: "now()",
    test: (s) => /\bnow\s*\(/i.test(s),
  },
  {
    id: "current_timestamp",
    test: (s) => /\bcurrent_timestamp\b/i.test(s),
  },
  {
    id: "current_date",
    test: (s) => /\bcurrent_date\b/i.test(s),
  },
  {
    id: "current_time",
    test: (s) => /\bcurrent_time\b/i.test(s),
  },
  {
    id: "clock_timestamp",
    test: (s) => /\bclock_timestamp\s*\(/i.test(s),
  },
  {
    id: "transaction_timestamp",
    test: (s) => /\btransaction_timestamp\s*\(/i.test(s),
  },
  {
    id: "statement_timestamp",
    test: (s) => /\bstatement_timestamp\s*\(/i.test(s),
  },
  {
    id: "timeofday",
    test: (s) => /\btimeofday\s*\(/i.test(s),
  },
  {
    id: "random",
    test: (s) => /\brandom\s*\(/i.test(s),
  },
  {
    id: "nextval",
    test: (s) => /\bnextval\s*\(/i.test(s),
  },
  {
    id: "::timestamptz cast",
    test: (s) => /::\s*timestamptz\b/i.test(s),
  },
  {
    id: "::timestamp cast",
    test: (s) => /::\s*timestamp\b(?!\s*with)/i.test(s),
  },
  {
    id: "::date cast",
    test: (s) => /::\s*date\b/i.test(s),
  },
];

function main() {
  const files = fs
    .readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const findings = [];

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIG_DIR, file), "utf8");
    const cleaned = stripSqlComments(sql);
    for (const { expr } of collectGeneratedExprs(cleaned, file)) {
      const hitRules = RULES.filter((r) => r.test(expr)).map((r) => r.id);
      if (hitRules.length > 0) {
        findings.push({ file, hitRules, snippet: expr.replace(/\s+/g, " ").slice(0, 220) });
      }
    }
  }

  console.log(
    "db:verify:generated-immutable — informational scan (GENERATED ALWAYS AS …)\n",
  );

  if (findings.length === 0) {
    console.log("No flagged expressions.\n");
    process.exit(0);
    return;
  }

  for (const row of findings) {
    console.log(`  ${row.file}`);
    console.log(`    Rules: ${row.hitRules.join(", ")}`);
    console.log(`    Expr (truncated): ${row.snippet}${row.snippet.length >= 220 ? "…" : ""}`);
    console.log("");
  }

  console.log(`Total flagged GENERATED expressions: ${findings.length}`);
  console.log("(Verify manually — extract/coalesce-only expressions may be false positives.)\n");
  process.exit(0);
}

main();
