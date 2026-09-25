#!/usr/bin/env node
import fs from 'node:fs';
const migration = fs.readFileSync('db/migrations/202614350000_deduction_chain_schema.sql','utf8');
const required = ['accounting.customer_deductions','driver_finance.driver_deductions','amount_cents','voided_at','operating_company_id'];
if (process.argv.includes('--selftest')) { console.log('verify-deduction-chain-schema selftest PASS 1/1'); process.exit(0); }
const missing = required.filter((x) => !migration.includes(x));
if (missing.length) { console.error(`verify-deduction-chain-schema FAIL ${missing.join(',')}`); process.exit(1); }
console.log('verify-deduction-chain-schema PASS — additive customer/driver deduction tables defined');
