import fs from "node:fs";
import path from "node:path";

// Legal/Finance separation of duties (Option B — LOCKED 2026-06-29; see
// docs/specs/LEGAL-FINANCE-OWNERSHIP-AND-FLIP-READINESS.md and
// docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md). The Legal module captures consent and
// hands off (contract_instance_links + one events.log_event); it NEVER posts money. The
// ASC 842 engine (FIN-22), deduction->GL (FIN-18), and amortization (FIN-21) own all GL.
//
// This guard FAILS the build if anything under apps/backend/src/legal/ posts to the GL —
// either by writing journal_entries/journal_entry_postings, or by importing a posting
// engine. events.log_event (the handoff notification) is explicitly allowed.

const LEGAL_DIR = "apps/backend/src/legal";

const BANNED_SQL = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+accounting\.(journal_entries|journal_entry_postings|posting_batches)\b/gi;
const BANNED_IMPORT = /\bfrom\s+["'][^"']*accounting\/(posting-engine|fuel-posting|bank-recon|recurring|void|period-close)[^"']*["']/gi;
const BANNED_CALL = /\b(insertPostingLines|assertBalanced|postJournalEntry|emitAccountingSpineEvent)\s*\(/g;

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
  name: "verify-legal-no-gl-posting",
  run: async () => {
    const dir = path.resolve(LEGAL_DIR);
    if (!fs.existsSync(dir)) {
      console.error(`verify-legal-no-gl-posting FAILED — missing ${LEGAL_DIR}`);
      process.exit(1);
    }
    const violations = [];
    for (const file of walk(dir)) {
      const src = fs.readFileSync(file, "utf8");
      const rel = path.relative(process.cwd(), file);
      for (const [label, re] of [
        ["GL write", BANNED_SQL],
        ["posting-engine import", BANNED_IMPORT],
        ["posting call", BANNED_CALL],
      ]) {
        re.lastIndex = 0;
        const m = src.match(re);
        if (m) violations.push(`${rel}: ${label} → ${[...new Set(m)].join(", ")}`);
      }
    }
    if (violations.length) {
      console.error(
        "verify-legal-no-gl-posting FAILED — the Legal module must NOT post money (Option B). " +
          "Move GL posting to FIN-18/FIN-21/FIN-22. Offending:\n  " +
          violations.join("\n  ")
      );
      process.exit(1);
    }
    console.log("verify-legal-no-gl-posting OK — Legal does no GL posting (Option B separation holds).");
  },
};
