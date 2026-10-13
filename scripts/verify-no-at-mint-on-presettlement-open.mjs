#!/usr/bin/env node
/**
 * R-186.1 — open pre-settlements must NEVER call allocateNextSettlementSourceDocumentRef
 * (that minted fake AlwaysTrack 5817/5818/5819). display_id is P-series via allocateSettlementDisplayId.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LABEL = "verify-no-at-mint-on-presettlement-open";
const ROOT = process.cwd();

export function findMintViolations({ link, display, bookended }) {
  const failures = [];
  if (/allocateNextSettlementSourceDocumentRef\s*\(/.test(link)) {
    failures.push("presettlement-link.service.ts still CALLS allocateNextSettlementSourceDocumentRef (open-time AT mint banned by R-186.1)");
  }
  if (!/P-series|P-\$\{|'P-'/.test(display) || /allocateNextSettlementSourceDocumentRef\s*\(/.test(display)) {
    failures.push("settlement-display-id.ts must mint P-series and must not call allocateNextSettlementSourceDocumentRef");
  }
  if (!/allocateSettlementDisplayId/.test(display)) {
    failures.push("settlement-display-id.ts must export allocateSettlementDisplayId");
  }
  if (/allocateNextSettlementSourceDocumentRef\s*\(/.test(bookended)) {
    failures.push("settlements-load-bookended.service.ts still CALLS allocateNextSettlementSourceDocumentRef (R-186.1 never auto-mint AT sequence)");
  }
  return failures;
}

const sources = {
  link: readFileSync(join(ROOT, "apps/backend/src/dispatch/presettlement-link.service.ts"), "utf8"),
  display: readFileSync(join(ROOT, "apps/backend/src/driver-finance/settlement-display-id.ts"), "utf8"),
  bookended: readFileSync(join(ROOT, "apps/backend/src/driver-finance/settlements-load-bookended.service.ts"), "utf8"),
};

if (process.argv.includes("--selftest")) {
  const mint = "\nconst ref = await allocateNextSettlementSourceDocumentRef(client, companyId);\n";
  const planted = [
    ["open path mints AT", { ...sources, link: sources.link + mint }],
    ["display id mints AT", { ...sources, display: sources.display + mint }],
    ["display id lost P-series", { ...sources, display: "export async function allocateSettlementDisplayId() { return 'S-' + n; }" }],
    ["display allocator missing", { ...sources, display: "const prefix = 'P-';" }],
    ["bookended close mints AT", { ...sources, bookended: sources.bookended + mint }],
  ];
  let caught = 0;
  for (const [name, input] of planted) {
    if (findMintViolations(input).length > 0) caught += 1;
    else console.error(`${LABEL} SELFTEST: planted violation escaped — ${name}`);
  }
  const clean = findMintViolations(sources);
  if (clean.length) console.error(`${LABEL} SELFTEST: clean source flagged — ${clean.join("; ")}`);
  console.log(`${LABEL} SELFTEST: ${caught}/${planted.length} planted violations caught`);
  process.exit(caught === planted.length && clean.length === 0 ? 0 : 1);
}

const failures = findMintViolations(sources);

if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — open/close paths do not mint AlwaysTrack sequence; display_id is P-series`);
process.exit(0);
