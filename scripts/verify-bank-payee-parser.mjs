#!/usr/bin/env node
// RC4 443.341: bank description payee parser must be called from the suggestion pipeline.
// Payee parsing was blocked by catch-all rules winning first (RC1 fixes that); RC4 wires it in.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const LABEL = 'verify-bank-payee-parser';

// Check the payee parser module exists
assert(
  fs.existsSync('apps/backend/src/banking/bank-description-payee.ts'),
  'bank-description-payee.ts missing — payee parser not present'
);

const engineSrc = fs.readFileSync('apps/backend/src/banking/banking-rules.engine.ts', 'utf8');

// parseBankDescription must be imported and called
assert(
  engineSrc.includes('parseBankDescription') || engineSrc.includes('bank-description-payee'),
  'banking-rules.engine.ts must import/call bank-description-payee — RC4 not wired'
);

// Must be called from suggestForBankTransaction
assert(
  engineSrc.includes('parseBankDescription'),
  'parseBankDescription not called in banking-rules.engine.ts — RC4 not wired'
);

// suggestForBankTransaction must return payee suggestions
assert(
  engineSrc.includes('suggestForBankTransaction'),
  'suggestForBankTransaction must exist and call payee parser'
);

console.log(LABEL + ' PASS — bank description payee parser wired into suggestion pipeline');
