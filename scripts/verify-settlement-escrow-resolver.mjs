#!/usr/bin/env node
/**
 * Settlement Pay-Run — escrow-liability-account-by-ID guard (Phase 4 GUARDS).
 *
 * Damage-Claim escrow is a driver LIABILITY sub-account. The pay-run escrow-credit path must resolve
 * that account BY ID (a driver-keyed bridge / role-mapping lookup), never by a fuzzy name match. Locks:
 *   (1) apps/backend/src/driver-finance/escrow-resolver.service.ts exports an async
 *       resolveDriverEscrowLiabilityAccount(...) function.
 *   (2) That function asserts the resolved account is a Liability (account_type check) and FAILS LOUD
 *       (throws) when it is not.
 *   (3) That function asserts the resolved account is NEVER the Faro ASSET '1150040084' (the wrong,
 *       cross-purpose account a name-fuzzy lookup could accidentally land on) and FAILS LOUD if it is.
 *   (4) NOWHERE in the escrow-resolution corpus (driver-finance/ + accounting/settlement-posting/) does
 *       an escrow account get resolved via `LIKE '%escrow%'` / `ILIKE '%escrow%'` / `.includes('escrow')`
 *       -style name lookup. A name-LIKE '%escrow%' LIMIT 1 can silently land on the wrong account (or a
 *       decoy/duplicate) — resolution must be deterministic (by id / role-mapping / bridge table).
 *
 * --selftest exercises assertGuard() against inline fixtures (pass + each failure mode), including a
 * false-positive check that unrelated escrow code (which never resolves-by-name) is NOT flagged.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-escrow-resolver";
const RESOLVER_REL = "apps/backend/src/driver-finance/escrow-resolver.service.ts";
const SCAN_DIRS = ["apps/backend/src/driver-finance", "apps/backend/src/accounting/settlement-posting"];

const EXPORT_FN_RE =
  /export\s+(?:async\s+)?function\s+resolveDriverEscrowLiabilityAccount\b|export\s+const\s+resolveDriverEscrowLiabilityAccount\s*=/;
const LIABILITY_CHECK_RE =
  /if\s*\([^)]*(?:account_type|accountType)[^)]*!==\s*['"]Liability['"][^)]*\)\s*\{[\s\S]{0,200}?throw/;
const FARO_LITERAL = "1150040084";
const BAD_NAME_LOOKUP_RE = /I?LIKE\s*'%escrow%'|\.includes\(\s*['"]escrow['"]\s*\)/i;

/** Strip // line comments and /* *\/ block comments so a guard-describing COMMENT can never satisfy — or
 * accidentally trip — a code-shape check (mirrors the existing verify-settlement-gl-flag-gate.mjs pattern). */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * True iff the code asserts the resolved account id/qbo-id is NEVER the Faro asset and throws when it is.
 * Accepts either the bare literal '1150040084' inline, OR a named constant bound to that literal elsewhere
 * in the file (e.g. `export const FARO_FACTORING_RESERVE_QBO_ID = "1150040084"`), used in a !== / ===
 * comparison followed (or preceded) closely by a throw. Comment-stripped input only.
 */
function hasFaroAssetGuard(code) {
  const idents = new Set([FARO_LITERAL]);
  const bindRe = /(\w+)\s*[:=]\s*["']1150040084["']/g;
  let m;
  while ((m = bindRe.exec(code))) idents.add(m[1]);
  for (const id of idents) {
    const idPattern = id === FARO_LITERAL ? `["']${FARO_LITERAL}["']` : id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const operatorThenId = new RegExp(`(?:===|!==)\\s*(?:String\\([^)]*\\)\\s*)?${idPattern}[\\s\\S]{0,250}?throw`, "i");
    const idThenOperator = new RegExp(`${idPattern}\\s*(?:===|!==)[\\s\\S]{0,250}?throw`, "i");
    if (operatorThenId.test(code) || idThenOperator.test(code)) return true;
  }
  return false;
}

/**
 * Pure evaluation.
 * @param {{ resolverText: string, corpusText: string }} args
 * @returns {string[]} errors
 */
export function assertGuard({ resolverText, corpusText }) {
  const errors = [];
  const resolverCode = stripComments(resolverText);
  const corpusCode = stripComments(corpusText);

  if (!EXPORT_FN_RE.test(resolverCode)) {
    errors.push(`${RESOLVER_REL}: must export an async resolveDriverEscrowLiabilityAccount(...) function`);
  }
  if (!LIABILITY_CHECK_RE.test(resolverCode)) {
    errors.push(
      `${RESOLVER_REL}: must assert the resolved account's account_type === 'Liability' and throw when it is not`
    );
  }
  if (!hasFaroAssetGuard(resolverCode)) {
    errors.push(
      `${RESOLVER_REL}: must assert the resolved account is NEVER the Faro asset ('${FARO_LITERAL}', literal or a ` +
        "named constant bound to it) and throw when it is"
    );
  }
  if (BAD_NAME_LOOKUP_RE.test(corpusCode)) {
    errors.push(
      "escrow account resolution must NEVER use a name LIKE '%escrow%' / ILIKE '%escrow%' / " +
        ".includes('escrow') lookup anywhere in driver-finance/ or accounting/settlement-posting/ — resolve by id"
    );
  }

  return errors;
}

function walkFiles(dirRel) {
  const abs = path.join(ROOT, dirRel);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) out.push(p);
    }
  };
  walk(abs);
  return out;
}

function buildCorpus() {
  let text = "";
  for (const dir of SCAN_DIRS) {
    for (const f of walkFiles(dir)) text += fs.readFileSync(f, "utf8") + "\n";
  }
  return text;
}

function selftest() {
  const goodResolver = `
export async function resolveDriverEscrowLiabilityAccount(client, operatingCompanyId, driverId) {
  const res = await client.query(
    \`SELECT ea.coa_account_id AS id, a.account_type
       FROM accounting.escrow_accounts ea
       JOIN catalogs.accounts a ON a.id = ea.coa_account_id
      WHERE ea.operating_company_id = $1 AND ea.holder_id = $2 AND ea.holder_type = 'driver' LIMIT 1\`,
    [operatingCompanyId, driverId]
  );
  const account = res.rows[0];
  if (!account || account.account_type !== 'Liability') {
    throw new Error('ESCROW_ACCOUNT_NOT_LIABILITY');
  }
  if (account.id === '1150040084') {
    throw new Error('ESCROW_ACCOUNT_IS_FARO_ASSET');
  }
  return account.id;
}
`;
  const cleanOtherFile = `
// unrelated settlement-posting helper — mentions "escrow" only in comments/identifiers, never a name lookup
export function driverEscrowSubAccountName(name) { return \`Driver Escrow - \${name}\`; }
`;
  const badOtherFile = `
async function legacyResolveEscrowAccount(client, opco) {
  const res = await client.query(
    \`SELECT id FROM catalogs.accounts WHERE operating_company_id = $1 AND name ILIKE '%escrow%' LIMIT 1\`,
    [opco]
  );
  return res.rows[0]?.id;
}
`;

  const cases = [
    {
      name: "well-formed resolver + clean corpus → 0 errors",
      in: { resolverText: goodResolver, corpusText: goodResolver + cleanOtherFile },
      want: 0,
    },
    {
      name: "missing exported function name",
      in: { resolverText: goodResolver.replace("export async function resolveDriverEscrowLiabilityAccount", "async function resolveDriverEscrowLiabilityAccount"), corpusText: goodResolver + cleanOtherFile },
      wantMin: 1,
    },
    {
      name: "missing Liability account_type assertion",
      in: {
        resolverText: goodResolver.replace(
          `if (!account || account.account_type !== 'Liability') {\n    throw new Error('ESCROW_ACCOUNT_NOT_LIABILITY');\n  }\n`,
          ""
        ),
        corpusText: goodResolver + cleanOtherFile,
      },
      wantMin: 1,
    },
    {
      name: "missing Faro-asset '1150040084' guard",
      in: {
        resolverText: goodResolver.replace(
          `if (account.id === '1150040084') {\n    throw new Error('ESCROW_ACCOUNT_IS_FARO_ASSET');\n  }\n`,
          ""
        ),
        corpusText: goodResolver + cleanOtherFile,
      },
      wantMin: 1,
    },
    {
      name: "a name-ILIKE '%escrow%' LIMIT-1 lookup anywhere in the corpus → FAIL",
      in: { resolverText: goodResolver, corpusText: goodResolver + badOtherFile },
      wantMin: 1,
    },
    {
      name: "false-positive check: unrelated escrow identifiers/comments never flagged",
      in: { resolverText: goodResolver, corpusText: goodResolver + cleanOtherFile },
      want: 0,
    },
    {
      name: "Faro check via a NAMED CONSTANT (not the bare literal) still satisfies the guard",
      in: {
        resolverText: goodResolver
          .replace("export async function", "const FARO_FACTORING_RESERVE_QBO_ID = \"1150040084\";\n\nexport async function")
          .replace("if (account.id === '1150040084') {", "if (String(account.id) === FARO_FACTORING_RESERVE_QBO_ID) {"),
        corpusText: goodResolver + cleanOtherFile,
      },
      want: 0,
    },
    {
      name: "false-positive check: a COMMENT describing the anti-pattern (not real code) is never flagged",
      in: {
        resolverText: goodResolver,
        corpusText:
          goodResolver +
          "\n// we DO NOT name-LIKE '%escrow%' anywhere — see resolveDriverEscrowLiabilityAccount instead\n",
      },
      want: 0,
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const n = assertGuard(c.in).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.wantMin;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}  (errors=${n})`);
  }
  if (failed) { console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }

const resolverAbs = path.join(ROOT, RESOLVER_REL);
if (!fs.existsSync(resolverAbs)) {
  console.error(`[${LABEL}] FAILED — missing ${RESOLVER_REL} (expected until the Phase 4 escrow-resolver lands)`);
  process.exit(1);
}
const resolverText = fs.readFileSync(resolverAbs, "utf8");
const corpusText = buildCorpus();
const errors = assertGuard({ resolverText, corpusText });
if (errors.length) {
  console.error(`[${LABEL}] FAILED — ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — escrow liability account resolves by id, asserts Liability + not-Faro-asset, no name-LIKE lookup anywhere.`);
