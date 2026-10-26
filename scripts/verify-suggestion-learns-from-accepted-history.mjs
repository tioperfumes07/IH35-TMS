#!/usr/bin/env node
// RC3 443.341: suggestion engine must learn from human-accepted history.
// Static check: applyHistoryLearningForTransaction must exist and reference categorized_by_user_id.
import fs from 'node:fs';

const LABEL = 'verify-suggestion-learns-from-accepted-history';
const ENGINE = 'apps/backend/src/banking/banking-rules.engine.ts';

function bodyOf(src, fnRe) {
  const at = src.search(fnRe);
  if (at < 0) return { at, end: -1, body: '' };
  const next = src.indexOf('\nexport ', at + 10);
  const end = next > 0 ? next : src.length;
  return { at, end, body: src.slice(at, end) };
}

/** Pure check over source text so --selftest can plant defects into copies (never tracked files). */
export function check(src) {
  const failures = [];
  if (!/function\s+applyHistoryLearningForTransaction\b/.test(src)) {
    failures.push('applyHistoryLearningForTransaction missing in banking-rules.engine.ts — RC3 not implemented');
  }
  if (!src.includes('categorized_by_user_id')) {
    failures.push('history learning must query categorized_by_user_id — RC3 not implemented');
  }
  if (!(src.includes('confidence: "high"') || src.includes("confidence: 'high'"))) {
    failures.push("history learning must promote high-count matches to confidence 'high'");
  }
  if (!src.includes('history_match') && !src.includes('history:count')) {
    failures.push("history learning must set source with 'history' prefix");
  }
  // Wired: suggestForBankTransaction must CALL it (not merely both names existing in the file).
  if (!/\bapplyHistoryLearningForTransaction\s*\(/.test(bodyOf(src, /function\s+suggestForBankTransaction\b/).body)) {
    failures.push('applyHistoryLearningForTransaction must be called from suggestForBankTransaction');
  }
  return failures;
}

const real = fs.readFileSync(ENGINE, 'utf8');

if (process.argv.includes('--selftest')) {
  const base = check(real);
  if (base.length) {
    console.error(`${LABEL} --selftest FAIL — real source rejected:\n- ${base.join('\n- ')}`);
    process.exit(1);
  }
  const sfb = bodyOf(real, /function\s+suggestForBankTransaction\b/);
  const mutations = [
    ['history learner removed', real.replace(/function\s+applyHistoryLearningForTransaction\b/g, 'function applyRenamed')],
    ['history no longer keyed on human-accepted rows', real.split('categorized_by_user_id').join('created_by_user_id')],
    ['high confidence never granted', real.split('confidence: "high"').join('confidence: "medium"').split("confidence: 'high'").join("confidence: 'medium'")],
    ['learner not called from suggestForBankTransaction', real.slice(0, sfb.at) + sfb.body.replace(/\bapplyHistoryLearningForTransaction\s*\(/g, 'skipHistory(') + real.slice(sfb.end)],
  ];
  let caught = 0;
  for (const [name, mutated] of mutations) {
    if (mutated === real) {
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
console.log(LABEL + ' PASS — history learning present and wired into suggestion pipeline');
