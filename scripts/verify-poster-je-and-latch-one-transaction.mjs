#!/usr/bin/env node
// ROUND 301 audit (CC-1) — a poster's journal entry and its idempotency latch (the posting row its "already posted?"
// read checks) commit in ONE transaction. Five posters committed the JE on its own (createJournalEntry) and wrote the
// latch row afterwards in a second transaction (withLuciaBypass): a failure between the two left a posted JE with no
// latch, and a retry posted the same claim / fine / purchase / accrual again. This guard fails if any of them writes
// its latch table outside the JE's transaction again.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-poster-je-and-latch-one-transaction";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const B = "apps/backend/src/accounting";
export const POSTERS = [
  { file: `${B}/warranty-posting/poster.service.ts`, latch: "warranty_reimburse_postings" },
  { file: `${B}/insurance-claim-recovery-posting/poster.service.ts`, latch: "insurance_claim_recovery_postings" },
  { file: `${B}/safety-fine-posting/poster.service.ts`, latch: "civil_fine_postings" },
  { file: `${B}/property-tax-posting/poster.service.ts`, latch: "property_tax_accruals" },
  { file: `${B}/parts-inventory-posting/poster.service.ts`, latch: "parts_purchase_postings" },
];
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Every write to the latch table must sit inside an afterInsertBeforeCommit hook or a withCurrentUser block that
 *  also creates the JE / bill on the same client. */
export function problems(file, latch, src) {
  const p = [];
  const code = strip(src);
  const writeRe = new RegExp(`(INSERT INTO|UPDATE) accounting\\.${latch}\\b`, "g");
  let m;
  let writes = 0;
  while ((m = writeRe.exec(code))) {
    writes++;
    const before = code.slice(0, m.index);
    const hook = before.lastIndexOf("afterInsertBeforeCommit: async (client, header) =>");
    const bypass = before.lastIndexOf("await withLuciaBypass(");
    const sameTx = before.lastIndexOf("await withCurrentUser(input.actor_user_id, async (client) =>");
    const jeOnClient = /createJournalEntryOnClient\(|createBillInClientTx\(/.test(code.slice(sameTx, m.index));
    const inHook = hook > bypass && hook > -1;
    const inSameTx = sameTx > bypass && sameTx > -1 && jeOnClient;
    if (!inHook && !inSameTx) p.push(`${file}: ${m[1]} accounting.${latch} runs outside the journal entry's transaction`);
  }
  if (!writes) p.push(`${file}: no write to accounting.${latch} found (guard out of date)`);
  if (/await createJournalEntry\([\s\S]{0,1500}?\n\s*\);\s*\n\s*await withLuciaBypass\(/.test(code)) p.push(`${file}: createJournalEntry followed by a separate withLuciaBypass write`);
  return p;
}

export function run() {
  return POSTERS.flatMap(({ file, latch }) => problems(file, latch, readFileSync(path.join(ROOT, file), "utf8")));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const own = run();
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const split = `const created = await createJournalEntry({ a: 1 }, { userId: x, role: "system" });\n  await withLuciaBypass(async (client) => {\n    await client.query(\`INSERT INTO accounting.warranty_reimburse_postings (x) VALUES (1)\`);\n  });`;
    if (!problems("plant.ts", "warranty_reimburse_postings", split).length) { console.error(`${LABEL} --selftest FAIL — split JE/latch not caught`); process.exit(1); }
    const real = readFileSync(path.join(ROOT, POSTERS[0].file), "utf8");
    if (!problems(POSTERS[0].file, POSTERS[0].latch, real.replace("afterInsertBeforeCommit: async (client, header) =>", "await withLuciaBypass(async (client) =>")).length) {
      console.error(`${LABEL} --selftest FAIL — latch moved out of the hook not caught`); process.exit(1);
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; 2/2 plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL —\n  ${own.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — ${POSTERS.length} posters commit the JE and their idempotency latch in one transaction.`);
}
