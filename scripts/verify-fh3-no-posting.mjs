#!/usr/bin/env node
/**
 * FH-3 amortization boundary guard + loan-payment poster contract.
 *
 * TWO assertions, one file, because they are two halves of the same boundary:
 *
 *  (A) BOUNDARY (unchanged): the FH-3 ENGINE (apps/backend/src/finance/amortization/*) persists loans +
 *      amortization rows to finance.* — its OWN tables — and must NOT post to the GL: no accounting.*
 *      writes, no posting_batches / journal_entry_postings, no posting engine. That separation is what
 *      keeps schedule generation replayable and money-free.
 *
 *  (B) POSTER (new): the gated poster that DOES post the split now EXISTS, outside the engine, in
 *      apps/backend/src/accounting/finance-hub-amortization-posting/. This guard previously only proved
 *      the absence of posting, which would have silently passed forever if the poster were never built
 *      (or were deleted). It now REQUIRES the poster, requires it to be gated on
 *      FINANCE_HUB_AMORTIZATION_POST_ENABLED, requires it to reuse the SHARED accounting JE spine
 *      (../amortization-posting/amortization-posting.service.js) rather than owning a second
 *      journal-entry INSERT, and requires the entry to be balance-checked (assertBalanced) before it
 *      is written.
 *
 * The migration must keep both FH-3 flags registered DEFAULT OFF.
 * --selftest exercises the assertions against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FH3_DIR = path.join(ROOT, "apps/backend/src/finance/amortization");
const FH3_MIGRATION = path.join(ROOT, "db/migrations/202606160100_fh3_amortization_data_model.sql");
const POSTER_DIR = path.join(ROOT, "apps/backend/src/accounting/finance-hub-amortization-posting");
const POSTER_SERVICE = path.join(POSTER_DIR, "loan-payment-posting.service.ts");
const POSTER_MATH = path.join(POSTER_DIR, "loan-payment-posting.math.ts");
const POSTER_ROUTES = path.join(POSTER_DIR, "loan-payment-posting.routes.ts");

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|mts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

const stripComments = (code) =>
  code.replace(/--.*$/gm, "").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const FORBIDDEN = [
  { re: /posting_batches/i, why: "references accounting.posting_batches" },
  { re: /journal_entry_postings/i, why: "references accounting.journal_entry_postings" },
  { re: /\bINSERT\s+INTO\s+accounting\./i, why: "INSERT INTO accounting.*" },
  { re: /\bUPDATE\s+accounting\./i, why: "UPDATE accounting.*" },
  { re: /\bDELETE\s+FROM\s+accounting\./i, why: "DELETE FROM accounting.*" },
  { re: /postSourceTransaction|reversePostedSourceTransaction|posting-engine/i, why: "calls the posting engine" },
];

/**
 * @param engineFiles {Array<{rel: string, code: string}>} FH-3 engine files (+ its migration)
 * @param poster {{service: string|null, math: string|null, routes: string|null}} poster sources (null = missing)
 * @param migration {string|null}
 */
export function assertFh3({ engineFiles, poster, migration }) {
  const errors = [];

  // (A) boundary — the engine posts nothing.
  if (engineFiles.length === 0) {
    errors.push("no FH-3 engine files found (expected apps/backend/src/finance/amortization/*)");
  }
  for (const { rel, code } of engineFiles) {
    const stripped = stripComments(code);
    for (const { re, why } of FORBIDDEN) {
      if (re.test(stripped)) errors.push(`${rel}: ${why} — the FH-3 engine must persist to finance.* only, no GL posting.`);
    }
  }

  // (B) poster — exists, flag-gated, reuses the shared spine, balance-checked.
  if (!poster.math) {
    errors.push("poster: loan-payment-posting.math.ts missing — the gated FH-3 payment poster must exist");
  } else if (!/FINANCE_HUB_AMORTIZATION_POST_FLAG_KEY\s*=\s*["']FINANCE_HUB_AMORTIZATION_POST_ENABLED["']/.test(poster.math)) {
    errors.push("poster math: FINANCE_HUB_AMORTIZATION_POST_FLAG_KEY must be 'FINANCE_HUB_AMORTIZATION_POST_ENABLED'");
  }

  if (!poster.service) {
    errors.push("poster: loan-payment-posting.service.ts missing — the gated FH-3 payment poster must exist");
  } else {
    const svc = stripComments(poster.service);
    const gate = svc.search(/isEnabled\([^)]*FINANCE_HUB_AMORTIZATION_POST_FLAG_KEY/);
    if (gate < 0) {
      errors.push("poster service: must resolve isEnabled(FINANCE_HUB_AMORTIZATION_POST_FLAG_KEY) — posting has to be flag-gated");
    }
    if (!/skipped_flag_off/.test(svc)) {
      errors.push("poster service: flag-OFF path must return skipped_flag_off (no-op, zero journal entries)");
    }
    const write = svc.search(/insertJournalEntryHeader\s*\(/);
    if (write < 0) {
      errors.push("poster service: must write the entry via the shared insertJournalEntryHeader() spine");
    }
    if (gate >= 0 && write >= 0 && write < gate) {
      errors.push("poster service: the journal-entry write must come AFTER the flag check");
    }
    if (!/from\s+["']\.\.\/amortization-posting\/amortization-posting\.service\.js["']/.test(poster.service)) {
      errors.push("poster service: must import the shared JE spine from ../amortization-posting/amortization-posting.service.js (no second header INSERT)");
    }
    if (/\bINSERT\s+INTO\s+accounting\.journal_entr/i.test(svc)) {
      errors.push("poster service: contains its own INSERT INTO accounting.journal_entr* — reuse the shared spine instead of duplicating the write");
    }
    if (!/assertBalanced\s*\(/.test(svc)) {
      errors.push("poster service: must assertBalanced() the legs before posting (balanced entry or throw)");
    }
    if (!/gl_liability_account_id/.test(svc) || !/gl_interest_expense_account_id/.test(svc) || !/payment_account_id/.test(svc)) {
      errors.push("poster service: the three legs must come from finance.loans FKs (gl_liability_account_id, gl_interest_expense_account_id, payment_account_id)");
    }
  }

  if (!poster.routes) {
    errors.push("poster: loan-payment-posting.routes.ts missing — the poster needs a mounted surface, not an orphan service");
  } else if (!/export default fp\(/.test(poster.routes)) {
    errors.push("poster routes: must `export default fp(...)` so the accounting autoloader mounts it (a named-only export 404s silently)");
  }

  // migration keeps both flags registered DEFAULT OFF.
  if (migration == null) {
    errors.push("FH-3 migration 202606160100_fh3_amortization_data_model.sql is missing.");
  } else {
    for (const key of ["FINANCE_HUB_AMORTIZATION_ENABLED", "FINANCE_HUB_AMORTIZATION_POST_ENABLED"]) {
      if (!new RegExp(`['"]${key}['"][\\s\\S]{0,600}?,\\s*false\\s*[,)]`).test(migration.replace(/--.*$/gm, ""))) {
        errors.push(`FH-3 migration must register ${key} with default_enabled=false (DEFAULT OFF).`);
      }
    }
  }

  return errors;
}

if (process.argv.includes("--selftest")) {
  const goodPosterService = `
    import { insertJournalEntryHeader } from "../amortization-posting/amortization-posting.service.js";
    const flagOn = await isEnabled(client, FINANCE_HUB_AMORTIZATION_POST_FLAG_KEY, {});
    if (!flagOn) return { result: "skipped_flag_off" };
    const acc = { liabilityAccountId: loan.gl_liability_account_id, i: loan.gl_interest_expense_account_id, p: loan.payment_account_id };
    assertBalanced(lines);
    journalEntryId = await insertJournalEntryHeader(client, id, date, memo, actor);
  `;
  const good = {
    engineFiles: [{ rel: "finance/amortization/amortization.service.ts", code: `INSERT INTO finance.loans (...)` }],
    poster: {
      service: goodPosterService,
      math: `export const FINANCE_HUB_AMORTIZATION_POST_FLAG_KEY = "FINANCE_HUB_AMORTIZATION_POST_ENABLED";`,
      routes: `export default fp(async (app) => {}, { name: "x" });`,
    },
    migration: `INSERT INTO lib.feature_flags (flag_key, description, default_enabled) VALUES
      ('FINANCE_HUB_AMORTIZATION_ENABLED', 'd', false),
      ('FINANCE_HUB_AMORTIZATION_POST_ENABLED', 'd', false);`,
  };
  // engine crossing the line + poster entirely absent + flag registered ON.
  const bad = {
    engineFiles: [{ rel: "finance/amortization/amortization.service.ts", code: `INSERT INTO accounting.journal_entries (...)` }],
    poster: { service: null, math: null, routes: null },
    migration: `INSERT INTO lib.feature_flags VALUES ('FINANCE_HUB_AMORTIZATION_ENABLED','d',true),('FINANCE_HUB_AMORTIZATION_POST_ENABLED','d',true);`,
  };
  // poster exists but posts BEFORE/WITHOUT the flag check and owns its own header INSERT.
  const ungated = {
    engineFiles: good.engineFiles,
    poster: {
      service: `journalEntryId = await client.query("INSERT INTO accounting.journal_entries (...)");`,
      math: `export const FINANCE_HUB_AMORTIZATION_POST_FLAG_KEY = "SOMETHING_ELSE";`,
      routes: `export async function registerRoutes() {}`,
    },
    migration: good.migration,
  };
  const g = assertFh3(good);
  const b = assertFh3(bad);
  const u = assertFh3(ungated);
  if (g.length !== 0) { console.error("SELFTEST FAIL: good fixture flagged", g); process.exit(1); }
  if (b.length < 6) { console.error("SELFTEST FAIL: bad fixture under-caught", b); process.exit(1); }
  if (!u.some((e) => /flag-gated/.test(e)) || !u.some((e) => /autoloader/.test(e))) {
    console.error("SELFTEST FAIL: ungated fixture under-caught", u);
    process.exit(1);
  }
  console.log("verify-fh3-no-posting selftest OK");
  process.exit(0);
}

const readOrNull = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);
const engineFiles = [...walk(FH3_DIR), ...(fs.existsSync(FH3_MIGRATION) ? [FH3_MIGRATION] : [])].map((f) => ({
  rel: path.relative(ROOT, f),
  code: fs.readFileSync(f, "utf8"),
}));
const errors = assertFh3({
  engineFiles,
  poster: {
    service: readOrNull(POSTER_SERVICE),
    math: readOrNull(POSTER_MATH),
    routes: readOrNull(POSTER_ROUTES),
  },
  migration: readOrNull(FH3_MIGRATION),
});
if (errors.length) {
  console.error("verify-fh3-no-posting FAIL:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(
  `verify-fh3-no-posting: OK — ${engineFiles.length} FH-3 engine files scanned (finance.* only, no GL posting); ` +
    "loan-payment poster present, flag-gated on FINANCE_HUB_AMORTIZATION_POST_ENABLED, reuses the shared JE spine, balance-checked; both flags default OFF."
);
