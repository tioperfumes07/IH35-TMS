#!/usr/bin/env node
/**
 * R-186.1 — open pre-settlements must NEVER call allocateNextSettlementSourceDocumentRef
 * (that minted fake AlwaysTrack 5817/5818/5819). display_id is P-series via allocateSettlementDisplayId.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LABEL = "verify-no-at-mint-on-presettlement-open";
const ROOT = process.cwd();

const LINK = readFileSync(join(ROOT, "apps/backend/src/dispatch/presettlement-link.service.ts"), "utf8");
const DISPLAY = readFileSync(join(ROOT, "apps/backend/src/driver-finance/settlement-display-id.ts"), "utf8");
const BOOKENDED = readFileSync(join(ROOT, "apps/backend/src/driver-finance/settlements-load-bookended.service.ts"), "utf8");

const failures = [];

if (/allocateNextSettlementSourceDocumentRef\s*\(/.test(LINK)) {
  failures.push("presettlement-link.service.ts still CALLS allocateNextSettlementSourceDocumentRef (open-time AT mint banned by R-186.1)");
}
if (!/P-series|P-\$\{|'P-'/.test(DISPLAY) || /allocateNextSettlementSourceDocumentRef\s*\(/.test(DISPLAY)) {
  failures.push("settlement-display-id.ts must mint P-series and must not call allocateNextSettlementSourceDocumentRef");
}
if (!/allocateSettlementDisplayId/.test(DISPLAY)) {
  failures.push("settlement-display-id.ts must export allocateSettlementDisplayId");
}
if (/allocateNextSettlementSourceDocumentRef\s*\(/.test(BOOKENDED)) {
  failures.push("settlements-load-bookended.service.ts still CALLS allocateNextSettlementSourceDocumentRef (R-186.1 never auto-mint AT sequence)");
}

if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — open/close paths do not mint AlwaysTrack sequence; display_id is P-series`);
process.exit(0);
