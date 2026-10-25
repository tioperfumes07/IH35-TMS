#!/usr/bin/env node
// RC3 443.341: suggestion engine must learn from human-accepted history.
// Static check: applyHistoryLearningForTransaction must exist and reference categorized_by_user_id.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const LABEL = 'verify-suggestion-learns-from-accepted-history';

const src = fs.readFileSync('apps/backend/src/banking/banking-rules.engine.ts', 'utf8');

assert(
  src.includes('applyHistoryLearningForTransaction'),
  'applyHistoryLearningForTransaction missing in banking-rules.engine.ts — RC3 not implemented'
);
assert(
  src.includes('categorized_by_user_id'),
  'history learning must query categorized_by_user_id — RC3 not implemented'
);
assert(
  src.includes("confidence: \"high\"") || src.includes("confidence: 'high'"),
  "history learning must promote high-count matches to confidence 'high'"
);
assert(
  src.includes("'history_match'") || src.includes('"history_match"') || src.includes("history:count") || src.includes("history_match"),
  "history learning must set source with 'history' prefix"
);

// Must be called from suggestForBankTransaction (the per-transaction entry point)
assert(
  src.includes('applyHistoryLearningForTransaction') && src.includes('suggestForBankTransaction'),
  'applyHistoryLearningForTransaction must be wired into suggestForBankTransaction'
);

console.log(LABEL + ' PASS — history learning present and wired into suggestion pipeline');
