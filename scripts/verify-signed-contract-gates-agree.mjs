#!/usr/bin/env node
/**
 * verify-signed-contract-gates-agree (LEG-02 / FIN-18)
 *
 * THE DEFECT. "Is this driver's contract validly signed?" is asked by several independent gates, and
 * each had its own hand-written copy of the answer. One copy fell behind: the FIN-18 consent gate in
 * legal/signed-finance-handoff.service.ts accepted ONLY `signed_electronically`, so a driver whose
 * contract was signed on paper resolved as UNSIGNED and every deduction against them was blocked —
 * while driver-finance/escrow-target.service.ts and fuel/fuel-card-overage-contract.service.ts had
 * honoured both states for weeks.
 *
 * That is a money defect in one direction and a legal-evidence defect in the other, from the same
 * root: three copies of one rule.
 *
 * PROD, 2026-07-28: legal.contract_instance_status =
 *   draft, sent, viewed, signed_electronically, signed_on_paper, voided, expired
 * so 'signed_on_paper' is real and has been since 202609140000. legal.contract_instances currently
 * holds 0 rows, which is why nobody had been denied yet — the defect was latent, and would have
 * activated silently the first time a wet-signed contract was filed.
 *
 * WHAT THIS ASSERTS. Every file that reads legal.contract_instances to decide "signed" must use the
 * single shared predicate. Two clauses, both mandatory:
 *   1. BOTH signed states count — otherwise paper-signed drivers are denied.
 *   2. paper requires the attached scan (signed_pdf_attachment_id) — otherwise an unevidenced claim
 *      authorises a wage deduction, which is the WORSE failure and the one a naive "just add the
 *      status" fix introduces.
 * A file may satisfy this by importing signedContractPredicate, or by spelling out both clauses
 * inline (the two pre-existing services do the latter and are correct — this guard does not force a
 * refactor it cannot verify at runtime, it forces AGREEMENT).
 *
 * Usage: node scripts/verify-signed-contract-gates-agree.mjs [--selftest]
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const LABEL = "verify-signed-contract-gates-agree";
const SCAN_DIR = "apps/backend/src";
const HELPER = "apps/backend/src/legal/signed-contract-predicate.ts";

export function gateProblems(path, src) {
  const out = [];
  // Only files that DECIDE "signed" by READING contract_instances.
  //
  // A WRITE is not a gate and must never be flagged: legal/contracts.service.ts does
  // `SET status = 'signed_electronically'` when a driver actually e-signs, which is exactly right —
  // an electronic signature sets the electronic status. Flagging that would push someone to "fix"
  // correct code into recording a paper signature for an e-signature. So the read predicate must be
  // matched specifically, not the mere presence of the literal.
  if (!/legal\.contract_instances/.test(src)) return out;
  if (path.endsWith("signed-contract-predicate.ts")) return out;

  const READ_GATE = /(?:WHERE|AND)\s+\w+\.status(?:::text)?\s*(?:=|IN)\s*(?:\(|')[^;]{0,120}?signed_electronically/i;
  const usesHelperInRead = /signedContractPredicate\s*\(/.test(src);
  if (!READ_GATE.test(src) && !usesHelperInRead) return out;

  const usesHelper = usesHelperInRead;
  const bothStates = /signed_on_paper/.test(src);
  const requiresScan = /signed_pdf_attachment_id/.test(src);

  if (usesHelper) return out; // the shared definition carries both clauses by construction

  if (!bothStates) {
    out.push(
      `${path}: decides "signed" from legal.contract_instances but accepts ONLY signed_electronically — a paper-signed driver reads as UNSIGNED and their deductions are blocked. Use signedContractPredicate("<alias>") or spell out both clauses.`
    );
  }
  if (bothStates && !requiresScan) {
    out.push(
      `${path}: accepts signed_on_paper WITHOUT requiring signed_pdf_attachment_id — an unevidenced paper claim would authorise a wage deduction. Never trust "paper" without the paper.`
    );
  }
  return out;
}

function collect() {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "__tests__") continue;
        walk(full);
      } else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) {
        out.push({ path: full.replace(`${ROOT}/`, ""), src: readFileSync(full, "utf8") });
      }
    }
  };
  walk(resolve(ROOT, SCAN_DIR));
  return out;
}

function run() {
  const files = collect();
  const gates = files.filter((f) => /legal\.contract_instances/.test(f.src) && /signed_electronically/.test(f.src));
  const problems = files.flatMap(({ path, src }) => gateProblems(path, src));
  if (problems.length) {
    console.error(`[${LABEL}] FAILED — ${problems.length} issue(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    return false;
  }
  console.log(
    `[${LABEL}] OK — ${gates.length} signed-contract gate(s); every one honours BOTH signed states and requires the scan for paper`
  );
  return true;
}

function selftest() {
  let ok = true;
  if (!run()) {
    console.error("SELFTEST FAIL: the real tree is flagged — false positive");
    ok = false;
  }

  const cases = [
    [
      "the exact LEG-02 defect: e-sign only",
      `FROM legal.contract_instances ci WHERE ci.status = 'signed_electronically'`,
      /accepts ONLY signed_electronically/,
    ],
    [
      "paper accepted without the scan — the worse fix",
      `FROM legal.contract_instances ci WHERE ci.status::text IN ('signed_electronically','signed_on_paper')`,
      /WITHOUT requiring signed_pdf_attachment_id/,
    ],
    [
      "both clauses inline — correct",
      `FROM legal.contract_instances ci WHERE ci.status::text IN ('signed_electronically','signed_on_paper') AND (ci.status::text <> 'signed_on_paper' OR ci.signed_pdf_attachment_id IS NOT NULL)`,
      null,
    ],
    [
      "uses the shared helper — correct",
      `FROM legal.contract_instances ci WHERE \${signedContractPredicate("ci")} AND signed_electronically`,
      null,
    ],
    ["unrelated file — ignored", `SELECT 1 FROM mdata.loads`, null],
  ];

  for (const [name, src, expect] of cases) {
    const problems = gateProblems("fixture.ts", src);
    if (expect === null) {
      if (problems.length) {
        console.error(`SELFTEST FAIL: '${name}' expected clean, got: ${problems[0]}`);
        ok = false;
      } else console.log(`SELFTEST: '${name}' -> clean as expected`);
    } else if (!problems.some((p) => expect.test(p))) {
      console.error(`SELFTEST FAIL: '${name}' not caught`);
      ok = false;
    } else console.log(`SELFTEST: '${name}' -> caught as expected`);
  }

  // Re-plant the real defect into the repaired file — proves the guard protects it.
  const target = "apps/backend/src/legal/signed-finance-handoff.service.ts";
  const real = readFileSync(resolve(ROOT, target), "utf8");
  const reverted = real.replace(/\$\{signedContractPredicate\("ci"\)\}/, "ci.status = 'signed_electronically'");
  if (reverted === real) {
    console.error("SELFTEST FAIL: could not re-plant the LEG-02 defect — the case proves nothing");
    ok = false;
  } else if (!gateProblems(target, reverted).length) {
    console.error("SELFTEST FAIL: re-planting the e-sign-only gate was not caught");
    ok = false;
  } else console.log("SELFTEST: re-planting the LEG-02 defect into the repaired gate -> caught");

  if (!ok) process.exit(1);
  console.log(`[${LABEL}] SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else process.exit(run() ? 0 : 1);
