#!/usr/bin/env node
/**
 * DISP-01 — two-event delivery revenue latch (earn Unbilled → bill A/R).
 * Rule 17: verify-steps/1647-verify-revrec-two-event-latch.mjs discovers this.
 * Module-completion scoreboard must stay in sync with docs/module-completion/*.json (--write-md).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-revrec-two-event-latch";
const SELFTEST = process.argv.includes("--selftest");

const PATHS = {
  poster: "apps/backend/src/accounting/revrec-delivery-posting/poster.service.ts",
  loads: "apps/backend/src/dispatch/loads.routes.ts",
  resolver: "apps/backend/src/accounting/coa-roles/resolver.service.ts",
  coaRoles: "apps/frontend/src/pages/accounting/CoaRolesPage.tsx",
  flags: "apps/backend/src/lib/feature-flags/service.ts",
  mig: "db/migrations/202609290000_disp_01_revrec_two_event_latch.sql",
  held: "db/migrations/.held-migrations.json",
};

function read(rel) {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** @param {Record<string, string>} sources */
export function check(sources) {
  const problems = [];
  const { poster, loads, resolver, coaRoles, flags, mig, held } = sources;

  if (!poster) problems.push("missing revrec-delivery-posting/poster.service.ts");
  else {
    const code = stripComments(poster);
    if (!/REVENUE_RECOGNITION_POST_ENABLED/.test(poster)) {
      problems.push("poster must gate on REVENUE_RECOGNITION_POST_ENABLED");
    }
    if (!/createJournalEntry/.test(code)) problems.push("poster must reuse createJournalEntry");
    if (!/resolveRoleAccount/.test(code)) problems.push("poster must reuse resolveRoleAccount");
    if (!/unbilled_revenue/.test(code)) problems.push("poster must resolve unbilled_revenue role");
    if (!/ar_control/.test(code)) problems.push("poster must resolve ar_control for Event 2");
    if (!/revenue_default/.test(code)) problems.push("poster must resolve revenue_default for Event 1");
    if (!/buildEarnEvent1Postings/.test(code) || !/buildBillEvent2Postings/.test(code)) {
      problems.push("poster must expose distinct Event 1 / Event 2 posting builders");
    }
    if (!/TRK/.test(poster)) problems.push("poster must exclude TRK");
    if (/debits\s*===\s*credits|amountCents\s*\+\s*amountCents/.test(code) && !/createJournalEntry/.test(code)) {
      problems.push("poster must not hand-roll GL balancing without createJournalEntry");
    }
    if (!/load_revenue_recognition_postings/.test(code)) {
      problems.push("poster must write load_revenue_recognition_postings latch");
    }

    // ACCT-F40: the hold migration may be absent from a running database. The poster
    // must detect that condition before it executes its first latch SELECT/INSERT.
    const probe = /const\s+LATCH_REGCLASS\s*=\s*["']accounting\.load_revenue_recognition_postings["'][\s\S]*?to_regclass\(\$1::text\)\s+IS\s+NOT\s+NULL[\s\S]*?\[LATCH_REGCLASS\]/;
    if (!probe.test(code)) {
      problems.push("poster must probe to_regclass for load_revenue_recognition_postings");
    }
    const postFn = code.slice(code.indexOf("export async function postLoadRevenueLatch"));
    const guardIndex = postFn.indexOf('if (!(await latchTablePresent(client))) return { gate: "latch_table_missing" as const };');
    const firstLatchUse = postFn.search(/(?:loadLatchExists|earnAmountCents|INSERT\s+INTO\s+accounting\.load_revenue_recognition_postings)/);
    if (guardIndex < 0 || (firstLatchUse >= 0 && guardIndex > firstLatchUse)) {
      problems.push("poster must fail closed with latch_table_missing before any latch use (migration 202609290000)");
    }
    if (!/prepared\.gate\s*===\s*["']latch_table_missing["'][\s\S]*?reason:\s*["']latch_table_missing["']/.test(code)) {
      problems.push("poster must return latch_table_missing to callers when migration 202609290000 is not applied");
    }
  }

  if (!loads) problems.push("missing loads.routes.ts");
  else if (!/postLoadRevenueLatch/.test(loads)) {
    problems.push("load transition must call postLoadRevenueLatch");
  } else if (!/delivered_pending_docs/.test(loads) || !/completed_docs_received/.test(loads)) {
    problems.push("load transition must wire earn + bill statuses");
  }

  if (!resolver) problems.push("missing resolver.service.ts");
  else if (!/"unbilled_revenue"/.test(resolver)) {
    problems.push("COA_ROLE_VALUES must include unbilled_revenue");
  } else {
    const fb = resolver.match(/const ROLE_FALLBACKS[\s\S]*?=\s*\{([\s\S]*?)\n\};/);
    if (fb && /unbilled_revenue\s*:/.test(fb[1])) {
      problems.push("unbilled_revenue must NOT have a ROLE_FALLBACKS shape match");
    }
  }

  if (!coaRoles) problems.push("missing CoaRolesPage.tsx");
  else if (!/unbilled_revenue\s*:\s*["']Unbilled revenue \(ASC 606 earn latch\)["']/.test(coaRoles)) {
    problems.push("CoA role label must describe unbilled_revenue as the ASC 606 earn latch");
  }

  if (!flags) problems.push("missing feature-flags/service.ts");
  else if (!/REVENUE_RECOGNITION_POST_ENABLED/.test(flags) || !/POSTING_FLAG_KEYS/.test(flags)) {
    problems.push("REVENUE_RECOGNITION_POST_ENABLED must be enrolled in POSTING_FLAG_KEYS");
  }

  if (!mig) problems.push("missing migration 202609290000_disp_01_revrec_two_event_latch.sql");
  else {
    if (!/HOLD-FOR-JORGE/.test(mig)) problems.push("migration must carry HOLD-FOR-JORGE");
    if (!/DO NOT RUN ON PROD/.test(mig)) problems.push("migration must carry DO NOT RUN ON PROD");
    if (!/load_revenue_recognition_postings/.test(mig)) problems.push("migration must create latch table");
    if (!/unbilled_revenue/.test(mig)) problems.push("migration must admit unbilled_revenue role");
    if (!/FORCE ROW LEVEL SECURITY/.test(mig)) problems.push("latch table must FORCE RLS");
    if (!/CANONICAL-CHECK:\s*load_revenue_recognition_latch/.test(mig) ||
        !/NOT a money ledger/.test(mig) || !/money lives only in accounting\.journal_entries/.test(mig)) {
      problems.push("migration must retain CANONICAL-CHECK identifying the latch as non-ledger linkage");
    }
    if (!/load_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+mdata\.loads\s*\(id\)/.test(mig)) {
      problems.push("migration must retain inline load_id REFERENCES mdata.loads(id)");
    }
    for (const column of ["created_by_user_id", "voided_by_user_id"]) {
      if (!new RegExp(`${column}\\s+uuid\\s+REFERENCES\\s+identity\\.users\\s*\\(id\\)`).test(mig)) {
        problems.push(`migration must retain inline ${column} REFERENCES identity.users(id)`);
      }
    }
  }

  if (!held) problems.push("missing .held-migrations.json");
  else if (!/202609290000_disp_01_revrec_two_event_latch\.sql/.test(held)) {
    problems.push("held registry must list 202609290000");
  }

  return problems;
}

function selftest() {
  const good = {
    poster: `REVENUE_RECOGNITION_POST_ENABLED\ncreateJournalEntry\nresolveRoleAccount\nunbilled_revenue\nar_control\nrevenue_default\nbuildEarnEvent1Postings\nbuildBillEvent2Postings\nTRK excluded\nconst LATCH_REGCLASS = "accounting.load_revenue_recognition_postings";\nasync function latchTablePresent() { SELECT to_regclass($1::text) IS NOT NULL [LATCH_REGCLASS] }\nexport async function postLoadRevenueLatch() { if (!(await latchTablePresent(client))) return { gate: "latch_table_missing" as const }; await loadLatchExists(); }\nif (prepared.gate === "latch_table_missing") return { posted: false, reason: "latch_table_missing" };`,
    loads: `postLoadRevenueLatch\ndelivered_pending_docs\ncompleted_docs_received`,
    resolver: `export const COA_ROLE_VALUES = ["unbilled_revenue"] as const;\nconst ROLE_FALLBACKS = { ar_control: {} };`,
    coaRoles: `const ROLE_LABELS = { unbilled_revenue: "Unbilled revenue (ASC 606 earn latch)" };`,
    flags: `POSTING_FLAG_KEYS\nREVENUE_RECOGNITION_POST_ENABLED`,
    mig: `HOLD-FOR-JORGE\nDO NOT RUN ON PROD\nload_revenue_recognition_postings\nunbilled_revenue\nFORCE ROW LEVEL SECURITY\nCANONICAL-CHECK: load_revenue_recognition_latch NOT a money ledger money lives only in accounting.journal_entries\nload_id uuid NOT NULL REFERENCES mdata.loads(id)\ncreated_by_user_id uuid REFERENCES identity.users(id)\nvoided_by_user_id uuid REFERENCES identity.users(id)`,
    held: `202609290000_disp_01_revrec_two_event_latch.sql`,
  };
  const cases = [
    ["missing schema probe", { ...good, poster: good.poster.replace("to_regclass($1::text)", "schema_probe_removed") }],
    ["missing fail-closed gate", { ...good, poster: good.poster.replace('if (!(await latchTablePresent(client))) return { gate: "latch_table_missing" as const };', "") }],
    ["missing load FK", { ...good, mig: good.mig.replace("REFERENCES mdata.loads(id)", "") }],
    ["missing user FK", { ...good, mig: good.mig.replace("voided_by_user_id uuid REFERENCES identity.users(id)", "voided_by_user_id uuid") }],
    ["missing canonical check", { ...good, mig: good.mig.replace("CANONICAL-CHECK:", "CANONICAL-CHECK-REMOVED:") }],
    ["missing CoA label", { ...good, coaRoles: "const ROLE_LABELS = {};" }],
  ];
  const goodProblems = check(good);
  if (goodProblems.length) {
    console.error(`${LABEL} --selftest FAIL good:`, goodProblems);
    process.exit(1);
  }
  for (const [name, fixture] of cases) {
    if (!check(fixture).length) {
      console.error(`${LABEL} --selftest FAIL ${name} fixture produced no violations`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest: PASS`);
}

function main() {
  if (SELFTEST) return selftest();
  const sources = Object.fromEntries(Object.entries(PATHS).map(([k, rel]) => [k, read(rel)]));
  const problems = check(sources);
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — earn/bill poster wired, flag-gated, role fail-closed, HOLD mig + latch`);
}

main();

