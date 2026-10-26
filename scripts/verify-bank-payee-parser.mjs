#!/usr/bin/env node
// RC4 443.341: bank description payee parser must be called from the suggestion pipeline.
// Payee parsing was blocked by catch-all rules winning first (RC1 fixes that); RC4 wires it in.
import fs from 'node:fs';

const LABEL = 'verify-bank-payee-parser';
const PARSER = 'apps/backend/src/banking/bank-description-payee.ts';
const ENGINE = 'apps/backend/src/banking/banking-rules.engine.ts';

/** Pure check over source text so --selftest can plant defects into copies (never tracked files). */
export function check({ parserExists, engineSrc }) {
  const failures = [];
  if (!parserExists) failures.push('bank-description-payee.ts missing — payee parser not present');
  if (!/from\s+["'][^"']*bank-description-payee(?:\.js)?["']/.test(engineSrc)) {
    failures.push('banking-rules.engine.ts must import bank-description-payee — RC4 not wired');
  }
  if (!/\bparseBankDescription\s*\(/.test(engineSrc)) {
    failures.push('parseBankDescription is not CALLED in banking-rules.engine.ts — RC4 not wired');
  }
  if (!/function\s+suggestForBankTransaction\b/.test(engineSrc)) {
    failures.push('suggestForBankTransaction must exist and call payee parser');
  }
  return failures;
}

const real = { parserExists: fs.existsSync(PARSER), engineSrc: fs.readFileSync(ENGINE, 'utf8') };

if (process.argv.includes('--selftest')) {
  const base = check(real);
  if (base.length) {
    console.error(`${LABEL} --selftest FAIL — real source rejected:\n- ${base.join('\n- ')}`);
    process.exit(1);
  }
  const mutations = [
    ['parser module deleted', { ...real, parserExists: false }],
    ['parser import removed', { ...real, engineSrc: real.engineSrc.replace(/from\s+["'][^"']*bank-description-payee(?:\.js)?["']/g, 'from "./elsewhere.js"') }],
    ['parser call removed (name only in a comment)', { ...real, engineSrc: real.engineSrc.replace(/\bparseBankDescription\s*\(/g, '/* parseBankDescription */ noop(') }],
    ['suggestForBankTransaction removed', { ...real, engineSrc: real.engineSrc.replace(/function\s+suggestForBankTransaction\b/g, 'function suggestRenamed') }],
  ];
  let caught = 0;
  for (const [name, mutated] of mutations) {
    if (JSON.stringify(mutated) === JSON.stringify(real)) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" changed nothing (re-anchor)`);
      process.exit(1);
    }
    if (check(mutated).length === 0) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" escaped`);
      process.exit(1);
    }
    caught += 1;
  }
  console.log(`${LABEL} SELFTEST PASS — ${caught}/${mutations.length} planted defects caught`);
  process.exit(0);
}

const failures = check(real);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(LABEL + ' PASS — bank description payee parser wired into suggestion pipeline');
