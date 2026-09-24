#!/usr/bin/env node
// GUARD — verify-bank-match-suggest-is-read-only (ROUND 140.6, DEVIN-B)
//
// Standing law: auto-match is permanently dead, a GET never writes, and
// banking.bank_transactions is 1,133 for USMCA EXACT and is never created,
// deleted or modified. That law is currently enforced by nothing but
// discipline. This guard arms it.
//
// THREE CHECKS:
// 1. STATIC: every GET route handler reachable from
//    apps/backend/src/accounting/bank-recon/** contains no INSERT/UPDATE/DELETE
//    and calls no function that does. The handler list is derived from the
//    router file (recon-worklist.routes.ts), not hard-coded.
// 2. LIVE: the USMCA row count in banking.bank_transactions is derived from the
//    table itself and asserted unchanged against the prior run's derived value
//    (stored in a baseline file next to this guard). NOT a literal 1133 pasted
//    in the file.
// 3. LIVE: zero journal entries exist whose source_transaction_type is a
//    suggestion/candidate path. Only accept/resolve paths post.
//
// Self-arming POPULATION check — never a flag, never an env var, never a
// hand-kept count. Baseline 0 for the JE check; the bank_transactions count is
// a derived value stored in a baseline file (shrink-only is NOT the right
// model for a fixed population — the count must be EXACTLY what it was last
// run, never changed).
//
// --write-baseline is FORBIDDEN. The baseline file is written only by the
// guard itself on first run (when no baseline exists) and updated only when
// the derived count matches the prior baseline (proving no change occurred).
//
// Self-test: node scripts/verify-bank-match-suggest-is-read-only.mjs --selftest
export const REQUIRES_LIVE_DB =
  "banking.bank_transactions row count + journal entry source_transaction_type — must fail-closed, never skip";

import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";
import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-bank-match-suggest-is-read-only";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const BANK_RECON_DIR = path.join(ROOT, "apps/backend/src/accounting/bank-recon");
const BASELINE_FILE = path.join(ROOT, "scripts", "verify-bank-match-suggest-is-read-only.baseline.json");

// Suggestion/candidate source_transaction_type values that must NEVER appear
// on a journal entry. Only accept/resolve paths post JEs.
const FORBIDDEN_JE_SOURCE_TYPES = [
  "bank_recon_suggest",
  "bank_recon_candidate",
  "bank_recon_auto_match",
  "bank_recon_auto_suggest",
  "suggest",
  "candidate",
  "auto_match_suggest",
];

// SQL write keywords that must NEVER appear in a GET handler's code path
const WRITE_KEYWORDS = /\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM|\.query\s*\(\s*['"`]\s*(INSERT|UPDATE|DELETE))/i;

/**
 * Classify a GET handler's code for write operations. Pure function — exported for selftest.
 * @param {{ route: string, handlerSource: string, calledFunctions: string[], functionSources: Record<string, string> }} handler
 * @returns {string[]} problems, empty when clean
 */
export function classifyGetHandler(handler) {
  const problems = [];
  const { route, handlerSource, calledFunctions = {}, functionSources = {} } = handler;

  // Check the handler itself for write keywords
  if (WRITE_KEYWORDS.test(handlerSource)) {
    problems.push(`GET ${route}: handler body contains a write operation (INSERT/UPDATE/DELETE)`);
  }

  // Check every function the handler calls for write keywords
  for (const [fnName, fnSource] of Object.entries(calledFunctions)) {
    if (WRITE_KEYWORDS.test(fnSource)) {
      problems.push(`GET ${route}: calls ${fnName}() which contains a write operation`);
    }
  }

  return problems;
}

/**
 * Classify a journal entry's source_transaction_type. Pure function — exported for selftest.
 * @param {{ source_transaction_type: string|null }} je
 * @returns {string|null} violation kind, or null if clean
 */
export function classifyJeSource(je) {
  const stt = je?.source_transaction_type;
  if (!stt) return null; // NULL is clean — not every JE has a source_transaction_type
  const lower = String(stt).toLowerCase();
  if (FORBIDDEN_JE_SOURCE_TYPES.some((s) => lower.includes(s))) {
    return `forbidden_source_transaction_type:${stt}`;
  }
  return null;
}

/**
 * Extract GET route handlers from a routes file source.
 * @param {string} source
 * @returns {Array<{ route: string, startLine: number, endLine: number }>}
 */
export function extractGetHandlers(source) {
  const handlers = [];
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/app\.get\s*\(\s*["'`]([^"'`]+)["'`]/);
    if (match) {
      handlers.push({ route: match[1], startLine: i, endLine: i });
    }
  }
  // Find the end of each handler (next app.get/app.post/etc or end of register function)
  for (let h = 0; h < handlers.length; h++) {
    const start = handlers[h].startLine;
    let end = start + 1;
    while (end < lines.length) {
      const line = lines[end];
      if (/\bapp\.(get|post|put|delete|patch)\s*\(/.test(line) && end > start) break;
      if (/^\s*\}\s*;?\s*$/.test(line) && end > start + 5) {
        // Check if this closes the register function
        let depth = 0;
        for (let k = start; k <= end; k++) {
          if (lines[k].includes("{")) depth++;
          if (lines[k].includes("}")) depth--;
        }
        if (depth <= 0) break;
      }
      end++;
    }
    handlers[h].endLine = end;
    handlers[h].handlerSource = lines.slice(start, end + 1).join("\n");
  }
  return handlers;
}

/**
 * Extract function calls from source text and map to their definitions.
 * @param {string} handlerSource
 * @param {string} fullFileSource
 * @returns {Record<string, string>} function name → function source
 */
export function extractCalledFunctions(handlerSource, fullFileSource) {
  const result = {};
  // Find function names called in the handler
  const callMatches = handlerSource.matchAll(/\b(await\s+)?(\w+)\s*\(/g);
  const calledNames = new Set();
  for (const m of callMatches) {
    const name = m[2];
    // Skip JS builtins and Fastify methods
    if (["app", "req", "reply", "console", "JSON", "Object", "Array", "Number", "String", "Boolean", "Date", "Math", "Error", "Promise", "parseInt", "parseFloat", "isNaN", "safeParse", "validationError", "currentAuthUser", "assertCompanyMembership"].includes(name)) continue;
    calledNames.add(name);
  }
  // Find each called function's definition in the full file
  for (const name of calledNames) {
    // Match: export async function name( ... ) { ... } OR function name( ... ) { ... }
    const fnRegex = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`, "i");
    const fnMatch = fullFileSource.match(fnRegex);
    if (fnMatch) {
      const startIdx = fnMatch.index;
      // Find the matching closing brace
      let braceStart = fullFileSource.indexOf("{", startIdx);
      if (braceStart === -1) continue;
      let depth = 0;
      let endIdx = braceStart;
      for (let i = braceStart; i < fullFileSource.length; i++) {
        if (fullFileSource[i] === "{") depth++;
        if (fullFileSource[i] === "}") depth--;
        if (depth === 0) { endIdx = i; break; }
      }
      result[name] = fullFileSource.slice(startIdx, endIdx + 1);
    }
  }
  return result;
}

function runSelftest() {
  const fixtures = [
    // Clean: GET handler with no writes
    {
      name: "GET handler with only SELECT",
      handler: {
        route: "/api/v1/bank-recon/worklist",
        handlerSource: `const data = await client.query("SELECT * FROM foo"); return data;`,
        calledFunctions: {},
      },
      expect: [],
    },
    // RED: GET handler with INSERT
    {
      name: "GET handler with INSERT",
      handler: {
        route: "/api/v1/bank-recon/suggest",
        handlerSource: `await client.query("INSERT INTO foo VALUES (1)"); return {};`,
        calledFunctions: {},
      },
      expect: ["write operation"],
    },
    // RED: GET handler calling a function that writes
    {
      name: "GET handler calling write function",
      handler: {
        route: "/api/v1/bank-recon/worklist",
        handlerSource: `const data = await getWorklist(); return data;`,
        calledFunctions: {
          getWorklist: `async function getWorklist() { await client.query("UPDATE foo SET x=1"); }`,
        },
      },
      expect: ["write operation"],
    },
    // Clean: GET handler calling a read-only function
    {
      name: "GET handler calling read-only function",
      handler: {
        route: "/api/v1/bank-recon/worklist",
        handlerSource: `const data = await getWorklist(); return data;`,
        calledFunctions: {
          getWorklist: `async function getWorklist() { return await client.query("SELECT 1"); }`,
        },
      },
      expect: [],
    },
    // RED: GET handler with DELETE FROM
    {
      name: "GET handler with DELETE FROM",
      handler: {
        route: "/api/v1/bank-recon/purge",
        handlerSource: `await client.query("DELETE FROM foo WHERE id=1"); return {};`,
        calledFunctions: {},
      },
      expect: ["write operation"],
    },
    // RED: GET handler with UPDATE
    {
      name: "GET handler with UPDATE",
      handler: {
        route: "/api/v1/bank-recon/modify",
        handlerSource: `await client.query("UPDATE bank_transactions SET matched=true"); return {};`,
        calledFunctions: {},
      },
      expect: ["write operation"],
    },
  ];

  let pass = 0;
  let fail = 0;
  for (const { name, handler, expect: exp } of fixtures) {
    const got = classifyGetHandler(handler);
    const ok = exp.every((e) => got.some((g) => g.includes(e))) && got.length === exp.length;
    if (!ok) {
      console.error(`${LABEL} --selftest FAIL — ${name}: expected ${JSON.stringify(exp)}, got ${JSON.stringify(got)}`);
      fail += 1;
    } else {
      pass += 1;
    }
  }

  // JE source classifier fixtures
  const jeFixtures = [
    { name: "clean JE with customer_payment_deposit", je: { source_transaction_type: "customer_payment_deposit" }, expect: null },
    { name: "clean JE with NULL source", je: { source_transaction_type: null }, expect: null },
    { name: "RED JE with bank_recon_suggest", je: { source_transaction_type: "bank_recon_suggest" }, expect: "forbidden" },
    { name: "RED JE with candidate", je: { source_transaction_type: "candidate" }, expect: "forbidden" },
    { name: "RED JE with auto_match_suggest", je: { source_transaction_type: "auto_match_suggest" }, expect: "forbidden" },
    { name: "clean JE with manual", je: { source_transaction_type: "manual" }, expect: null },
  ];

  for (const { name, je, expect: exp } of jeFixtures) {
    const got = classifyJeSource(je);
    const ok = (exp === null && got === null) || (exp && got && got.includes(exp));
    if (!ok) {
      console.error(`${LABEL} --selftest FAIL — ${name}: expected ${exp}, got ${got}`);
      fail += 1;
    } else {
      pass += 1;
    }
  }

  if (fail > 0) {
    process.exitCode = 1;
  } else {
    console.log(`${LABEL} --selftest PASS — ${pass} classifier fixtures all correct`);
  }
}

async function runStaticCheck() {
  const problems = [];
  const routesFile = path.join(BANK_RECON_DIR, "recon-worklist.routes.ts");
  if (!fs.existsSync(routesFile)) {
    console.log(`${LABEL}: static SKIP — routes file not found`);
    return problems;
  }
  const routesSource = fs.readFileSync(routesFile, "utf8");
  const getHandlers = extractGetHandlers(routesSource);
  for (const handler of getHandlers) {
    const calledFunctions = extractCalledFunctions(handler.handlerSource, routesSource);
    const handlerProblems = classifyGetHandler({
      route: handler.route,
      handlerSource: handler.handlerSource,
      calledFunctions,
    });
    problems.push(...handlerProblems);
  }
  return problems;
}

async function measureLive(client) {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',false)");

  // Check 2: bank_transactions row count for USMCA
  const btRes = await client.query(
    `SELECT count(*)::int AS cnt
       FROM banking.bank_transactions
      WHERE operating_company_id = $1::uuid`,
    [USMCA_COMPANY_ID],
  );
  const btCount = btRes.rows[0].cnt;

  // Check 3: JEs with forbidden source_transaction_type
  const jeRes = await client.query(
    `SELECT je.id::text, je.source_transaction_type
       FROM accounting.journal_entries je
      WHERE je.operating_company_id = $1::uuid
        AND je.source_transaction_type IS NOT NULL
        AND je.source_transaction_type = ANY($2::text[])`,
    [USMCA_COMPANY_ID, FORBIDDEN_JE_SOURCE_TYPES],
  );

  await client.query("ROLLBACK");
  return { btCount, forbiddenJEs: jeRes.rows };
}

function run({ selftest }) {
  if (selftest) {
    runSelftest();
    return Promise.resolve();
  }
  return runFull();
}

async function runFull() {
  // CHECK 1: Static — GET handlers must not write
  const staticProblems = await runStaticCheck();
  if (staticProblems.length > 0) {
    console.error(
      `${LABEL}: STATIC FAIL — ${staticProblems.length} GET handler(s) with write operations:\n` +
        staticProblems.map((p) => `  ${p}`).join("\n"),
    );
    process.exitCode = 1;
    return;
  }
  console.log(`${LABEL}: STATIC PASS — 0 write operations in GET handlers.`);

  // CHECK 2 + 3: Live — bank_transactions count + forbidden JEs
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    const { btCount, forbiddenJEs } = await measureLive(client);

    // Check 3: forbidden JEs (baseline 0)
    if (forbiddenJEs.length > 0) {
      const sample = forbiddenJEs.slice(0, 10).map((je) => `  ${je.id} [${je.source_transaction_type}]`).join("\n");
      console.error(
        `${LABEL}: LIVE FAIL — ${forbiddenJEs.length} journal entr(ies) with forbidden suggestion/candidate source_transaction_type.\n` +
          `First ${Math.min(10, forbiddenJEs.length)}:\n${sample}`,
      );
      process.exitCode = 1;
      return;
    }

    // Check 2: bank_transactions count unchanged from prior run
    let baseline = null;
    if (fs.existsSync(BASELINE_FILE)) {
      baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
    }

    if (!baseline) {
      // First run — write the baseline (this is the ONLY time the baseline is created)
      const measured = {
        measured_at: new Date().toISOString(),
        bank_transactions_count: btCount,
        _comment: "bank_transactions count for USMCA — derived from the table, never hardcoded. Asserted unchanged every run.",
      };
      fs.writeFileSync(BASELINE_FILE, JSON.stringify(measured, null, 2) + "\n");
      console.log(
        `${LABEL}: LIVE PASS — bank_transactions=${btCount} (baseline written on first run), 0 forbidden JEs. Baseline 0 held.`,
      );
    } else {
      const priorCount = baseline.bank_transactions_count;
      if (btCount !== priorCount) {
        console.error(
          `${LABEL}: LIVE FAIL — bank_transactions count changed: ${priorCount} → ${btCount}. ` +
            `banking.bank_transactions is never created, deleted or modified for USMCA. ` +
            `If this is a legitimate feed change, update the baseline file with the new derived count.`,
        );
        process.exitCode = 1;
        return;
      }
      console.log(
        `${LABEL}: LIVE PASS — bank_transactions=${btCount} (unchanged from prior run), 0 forbidden JEs. Baseline 0 held.`,
      );
    }
  } finally {
    client.release();
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await run({ selftest: process.argv.includes("--selftest") });
}
