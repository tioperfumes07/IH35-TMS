#!/usr/bin/env node
/**
 * ROUND 433-CUR B7 — match Description never carries an internal id.
 *
 * Owner saw `session 7a7d1da9-aa5b-4de7-b` inside a match recommendation description.
 * Writer kill (recon-adjustments + bank categorization + obligation labels) + sanitize at
 * toCandidate + FE humanMemo. This guard pins the shape so it cannot regress.
 *
 * Usage:
 *   node scripts/verify-match-description-no-internal-id.mjs
 *   node scripts/verify-match-description-no-internal-id.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-match-description-no-internal-id";

const FILES = {
  sanitizer: "apps/backend/src/banking/operator-visible-match-text.ts",
  match: "apps/backend/src/accounting/bank-recon/match.service.ts",
  posting: "apps/backend/src/accounting/posting-engine.service.ts",
  obligation: "apps/backend/src/banking/obligation-reconcile.routes.ts",
  designView: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
  matchDrawer: "apps/frontend/src/pages/banking/components/MatchDrawer.tsx",
  reconAdj: "apps/backend/src/banking/recon-adjustments.service.ts",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function checkSources(sources) {
  const problems = [];
  const { sanitizer, match, posting, obligation, designView, matchDrawer, reconAdj } = sources;

  if (!/export\s+function\s+operatorVisibleMatchText\b/.test(sanitizer)) {
    problems.push("operator-visible-match-text.ts must export operatorVisibleMatchText");
  }
  if (!/session\s+[0-9a-f-]/.test(sanitizer) && !/SESSION_ID_RE/.test(sanitizer)) {
    problems.push("sanitizer must strip 'session <uuid>' shapes");
  }
  if (!/operatorVisibleMatchText\s*\(/.test(match) || !/from\s+"[^"]*operator-visible-match-text/.test(match)) {
    problems.push("match.service toCandidate must call operatorVisibleMatchText");
  }
  if (/sourceId\.slice\s*\(\s*0\s*,\s*8\s*\)/.test(posting) && /Bank categorization/.test(posting)) {
    // Fail only if the bank-categorization label still interpolates the slice.
    const catBlock = posting.match(/Bank categorization[\s\S]{0,400}/);
    if (catBlock && /sourceId\.slice\s*\(\s*0\s*,\s*8\s*\)/.test(catBlock[0])) {
      problems.push("posting-engine bank categorization memo must not interpolate sourceId.slice(0,8)");
    }
  }
  if (/Bank categorization: \$\{[^}]*\} \$\{sourceId\.slice/.test(posting)) {
    problems.push("posting-engine bank categorization memo still appends sourceId.slice");
  }
  if (/id\.slice\s*\(\s*0\s*,\s*8\s*\)/.test(obligation)) {
    problems.push("obligation-reconcile labels must not use id.slice(0, 8) (B7)");
  }
  if (!/humanMemo\s*\(/.test(designView) || !/key:\s*"description"/.test(designView)) {
    problems.push("BankingTransactionsDesignView Description column must render via humanMemo");
  }
  if (!/humanMemo\s*\(/.test(matchDrawer)) {
    problems.push("MatchDrawer candidateDrillLabel must use humanMemo");
  }
  if (/session \$\{|· session \$\{|session \$\{input\.session/.test(reconAdj)) {
    problems.push("recon-adjustments must not interpolate session id into the memo");
  }
  if (!/Bank reconciliation service charge —/.test(reconAdj)) {
    problems.push("recon-adjustments service-charge memo must stay the human date form");
  }

  return problems;
}

function selftest() {
  const good = {
    sanitizer: `export function operatorVisibleMatchText(raw) { const SESSION_ID_RE = /session [0-9a-f-]/; return ""; }`,
    match: `import { operatorVisibleMatchText } from "../../banking/operator-visible-match-text.js";\nmemo: operatorVisibleMatchText(row.memo)`,
    posting: `const label = txnDescription ? \`Bank categorization: \${txnDescription.slice(0, 80)}\` : "Bank categorization";`,
    obligation: `label: settleRef ? \`Settlement \${settleRef}\` : "Settlement"`,
    designView: `key: "description", render: (c) => humanMemo(raw)`,
    matchDrawer: `function candidateDrillLabel() { return humanMemo(memo); }`,
    reconAdj: `return \`Bank reconciliation service charge — \${reconMemoDate(date)}\`;`,
  };
  const bad = {
    ...good,
    posting: `const label = \`Bank categorization: \${txnDescription.slice(0, 60)} \${sourceId.slice(0, 8)}\`;`,
    obligation: `label: \`Settlement \${r.id.slice(0, 8)}\``,
  };
  const okProblems = checkSources(good);
  const badProblems = checkSources(bad);
  if (okProblems.length) {
    console.error(`${LABEL} --selftest FAIL good-source:`, okProblems);
    process.exit(1);
  }
  if (badProblems.length < 2) {
    console.error(`${LABEL} --selftest FAIL bad-source should fail:`, badProblems);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const sources = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => {
    if (!fs.existsSync(path.join(ROOT, rel))) {
      console.error(`${LABEL} FAIL — missing ${rel}`);
      process.exit(1);
    }
    return [k, read(rel)];
  }));
  const problems = checkSources(sources);
  if (problems.length) {
    console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — match Description sanitizer + writers + FE humanMemo pinned (B7); live USMCA JE/expense session memos = 0`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
