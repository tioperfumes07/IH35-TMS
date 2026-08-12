#!/usr/bin/env node
/**
 * ACCT-F375 — accounting.banking_rules + banking-rules.engine.ts have always WRITTEN
 * suggested_account_id/suggested_vendor_id/suggested_confidence onto banking.bank_transactions, but
 * nothing anywhere READ those columns: no route selected them into a response, no frontend file
 * referenced them (`grep -rln suggested_account_id apps/frontend/src` returned zero hits). The rule
 * engine was write-only dead code from the day it shipped.
 *
 * GET /api/v1/banking/transactions/:id/suggestions is the one endpoint the categorization UI actually
 * calls for a suggestion (apps/frontend/src/api/banking.ts:742-743) — this is where a rule match now
 * surfaces, reusing bankingRuleMatches() verbatim from banking-rules.engine.ts. No new matching logic,
 * no new GL math, read-only against accounting.banking_rules.
 *
 * INVARIANT (static — no database): the suggestions route must import bankingRuleMatches, query
 * accounting.banking_rules, call bankingRuleMatches against the target transaction, and include
 * rule_match in its JSON response — not merely fetch the rules and drop them on the floor.
 *
 * Self-test: node scripts/verify-bank-suggestions-includes-rule-match.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-bank-suggestions-includes-rule-match";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const TARGET = "apps/backend/src/banking/banking.routes.ts";

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Isolates the GET /transactions/:id/suggestions handler (anchored on its route string, since this
 * file has only one such route) and checks: (1) it imports bankingRuleMatches, (2) it queries
 * accounting.banking_rules, (3) it calls bankingRuleMatches inside the handler, (4) the JSON response
 * includes rule_match — not just computed and discarded.
 */
export function checkSuggestionsIncludesRuleMatch(src) {
  const code = stripComments(src);

  const hasImport = /import\s*\{[^}]*bankingRuleMatches[^}]*\}\s*from\s*["']\.\/banking-rules\.engine\.js["']/.test(
    code
  );
  if (!hasImport) return { ok: false, reason: "does not import bankingRuleMatches from banking-rules.engine.js" };

  const routeAnchor = /app\.get\(\s*["']\/api\/v1\/banking\/transactions\/:id\/suggestions["']/;
  const routeMatch = routeAnchor.exec(code);
  if (!routeMatch) return { ok: false, reason: "GET /transactions/:id/suggestions route not found" };

  // Grab a generous window after the route declaration covering the handler body.
  const block = code.slice(routeMatch.index, routeMatch.index + 4000);

  if (!/FROM\s+accounting\.banking_rules/i.test(block)) {
    return { ok: false, reason: "handler does not query accounting.banking_rules" };
  }
  if (!/bankingRuleMatches\s*\(/.test(block)) {
    return { ok: false, reason: "handler does not call bankingRuleMatches" };
  }
  if (!/rule_match/.test(block)) {
    return { ok: false, reason: "handler computes a rule match but never returns rule_match in the response" };
  }
  return { ok: true };
}

const isEntryPoint = import.meta.url === `file://${process.argv[1]}`;

if (isEntryPoint && process.argv.includes("--selftest")) {
  const good = `
    import { bankingRuleMatches, type BankingRuleRow } from "./banking-rules.engine.js";
    export function register(app) {
      app.get("/api/v1/banking/transactions/:id/suggestions", async (req, reply) => {
        const rulesRes = await client.query(\`SELECT id, then_account_id FROM accounting.banking_rules WHERE operating_company_id = $1\`, [companyId]);
        let ruleMatch = null;
        for (const rule of rulesRes.rows) {
          if (bankingRuleMatches(rule, target)) { ruleMatch = { rule_id: rule.id }; break; }
        }
        return { suggestions: [], rule_match: ruleMatch };
      });
    }
  `;
  const goodResult = checkSuggestionsIncludesRuleMatch(good);
  if (!goodResult.ok) fail(`selftest: known-good fixture should pass — ${goodResult.reason}`);

  const regressedNoReturn = `
    import { bankingRuleMatches, type BankingRuleRow } from "./banking-rules.engine.js";
    export function register(app) {
      app.get("/api/v1/banking/transactions/:id/suggestions", async (req, reply) => {
        const rulesRes = await client.query(\`SELECT id, then_account_id FROM accounting.banking_rules WHERE operating_company_id = $1\`, [companyId]);
        let ruleMatch = null;
        for (const rule of rulesRes.rows) {
          if (bankingRuleMatches(rule, target)) { ruleMatch = { rule_id: rule.id }; break; }
        }
        return { suggestions: [] };
      });
    }
  `;
  const regressedResult = checkSuggestionsIncludesRuleMatch(regressedNoReturn);
  if (regressedResult.ok) fail("selftest: regressed fixture (rule_match computed but not returned) should FAIL but passed");

  const commentTrap = `
    export function register(app) {
      // TODO: import bankingRuleMatches from banking-rules.engine.js, query accounting.banking_rules,
      // and return rule_match
      app.get("/api/v1/banking/transactions/:id/suggestions", async (req, reply) => {
        return { suggestions: [] };
      });
    }
  `;
  const trapResult = checkSuggestionsIncludesRuleMatch(commentTrap);
  if (trapResult.ok) fail("selftest: comment-trap fixture (fix mentioned only in a comment) should FAIL but the guard matched its own prose");

  console.log(`[${LABEL}] selftest: PASS — good/regressed/comment-trap fixtures all classify correctly`);
  process.exit(0);
}

if (isEntryPoint) {
  const filePath = path.join(ROOT, TARGET);
  if (!fs.existsSync(filePath)) fail(`${TARGET}: file not found`);
  const src = fs.readFileSync(filePath, "utf8");
  const result = checkSuggestionsIncludesRuleMatch(src);
  if (!result.ok) fail(`${TARGET}: ${result.reason}`);
  console.log(`[${LABEL}] PASS — GET /transactions/:id/suggestions surfaces a banking_rules match, not just the fuzzy-history suggestions`);
}
