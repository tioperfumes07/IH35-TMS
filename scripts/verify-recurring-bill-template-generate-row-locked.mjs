#!/usr/bin/env node
/**
 * ACCT-F5649 — `generateFromTemplate` (recurring-bill-template `generate-now`, reachable via
 * POST /api/v1/accounting/recurring-bill-templates/:uuid/generate-now AND the daily cron worker)
 * read the template with a plain SELECT (no FOR UPDATE), checked `is_active` against that unlocked
 * row, called `createBill()` on a totally separate connection, then advanced `next_generation_date`
 * with an unconditional blind UPDATE (no compare-and-swap). Two concurrent/racing calls for the same
 * template (double-click, retry-on-timeout, or a manual click racing the cron tick) could both pass
 * the unlocked check and both create a real duplicate AP bill (and duplicate GL JE if
 * BILL_GL_POSTING_ENABLED is on for that entity).
 *
 * FAIL if the template SELECT lacks FOR UPDATE, if the next_generation_date UPDATE has no
 * compare-and-swap WHERE clause, or if createBill() runs before the row is locked. PASS when the
 * lock, createBill(), and the CAS-update all live inside the SAME withLuciaBypass transaction.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-recurring-bill-template-generate-row-locked";
const FILE = path.join(
  ROOT,
  "apps/backend/src/accounting/bills/recurring/generator.service.ts"
);

export function analyzeGeneratorSource(src) {
  const failures = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  const fnMatch = code.match(/export async function generateFromTemplate\([\s\S]*?\n\}/);
  if (!fnMatch) {
    failures.push(`${path.relative(ROOT, FILE)}: could not locate generateFromTemplate function body`);
    return failures;
  }
  const fn = fnMatch[0];

  if (!/SELECT \* FROM accounting\.recurring_bill_templates[\s\S]*?FOR UPDATE/.test(fn)) {
    failures.push(`${path.relative(ROOT, FILE)}: template SELECT must carry FOR UPDATE`);
  }

  // The lock, createBill(), and the date-advance must share ONE withLuciaBypass call — i.e. createBill(
  // must appear textually BEFORE the UPDATE ... next_generation_date, and both inside the same
  // "await withLuciaBypass(async (client) => {" block (only one such block should contain createBill().
  const bypassBlocks = fn.match(/await withLuciaBypass\(async \(client\) => \{[\s\S]*?\n  \}\);?/g) || [];
  const lockingBlock = bypassBlocks.find((b) => b.includes("createBill("));
  if (!lockingBlock) {
    failures.push(`${path.relative(ROOT, FILE)}: createBill() must run inside the SAME withLuciaBypass transaction that holds the template's FOR UPDATE lock`);
  } else {
    if (!/FOR UPDATE/.test(lockingBlock)) {
      failures.push(`${path.relative(ROOT, FILE)}: the withLuciaBypass block calling createBill() must also hold the FOR UPDATE lock`);
    }
    const createIdx = lockingBlock.indexOf("createBill(");
    const updateIdx = lockingBlock.indexOf("UPDATE accounting.recurring_bill_templates");
    if (createIdx < 0 || updateIdx < 0 || updateIdx < createIdx) {
      failures.push(`${path.relative(ROOT, FILE)}: the next_generation_date UPDATE must run AFTER createBill(), still inside the locked transaction`);
    }
  }

  if (!/WHERE uuid = \$1::uuid AND next_generation_date IS NOT DISTINCT FROM \$3::date/.test(fn)) {
    failures.push(`${path.relative(ROOT, FILE)}: next_generation_date UPDATE must be a compare-and-swap against the originally-locked value (WHERE ... AND next_generation_date IS NOT DISTINCT FROM $3)`);
  }

  return failures;
}

export function run() {
  const src = fs.readFileSync(FILE, "utf8");
  return analyzeGeneratorSource(src);
}

if (process.argv.includes("--selftest")) {
  const GOOD = `
export async function generateFromTemplate(templateUuid, targetDate, actorUserId) {
  const { billUuid, nextGenerationDate, template } = await withLuciaBypass(async (client) => {
    const res = await client.query(
      \`SELECT * FROM accounting.recurring_bill_templates WHERE uuid = $1::uuid FOR UPDATE\`,
      [templateUuid]
    );
    const tmpl = res.rows[0];
    const bill = await createBill({ operatingCompanyId: tmpl.operating_company_id }, actorUserId);
    const billId = bill.id;
    const nextDate = computeNextGenerationDate(targetDate, tmpl.frequency);
    const upd = await client.query(
      \`
        UPDATE accounting.recurring_bill_templates
        SET next_generation_date = $2::date, updated_at = now()
        WHERE uuid = $1::uuid AND next_generation_date IS NOT DISTINCT FROM $3::date
      \`,
      [templateUuid, nextDate, tmpl.next_generation_date]
    );
    if (upd.rowCount === 0) throw new Error("recurring_bill_template_generation_race");
    return { billUuid: billId, nextGenerationDate: nextDate, template: tmpl };
  });
  return { billUuid, nextGenerationDate };
}
`;
  const goodFailures = analyzeGeneratorSource(GOOD);
  if (goodFailures.length) {
    throw new Error(`[${LABEL}] selftest PASS fixture FAILED: ${goodFailures.join("; ")}`);
  }

  const BAD_NO_LOCK = `
export async function generateFromTemplate(templateUuid, targetDate, actorUserId) {
  const template = await withLuciaBypass(async (client) => {
    const res = await client.query(
      \`SELECT * FROM accounting.recurring_bill_templates WHERE uuid = $1::uuid\`,
      [templateUuid]
    );
    return res.rows[0];
  });
  const bill = await createBill({ operatingCompanyId: template.operating_company_id }, actorUserId);
  const billUuid = bill.id;
  const nextDate = computeNextGenerationDate(targetDate, template.frequency);
  await withLuciaBypass(async (client) => {
    await client.query(
      \`
        UPDATE accounting.recurring_bill_templates
        SET next_generation_date = $2::date, updated_at = now()
        WHERE uuid = $1::uuid
      \`,
      [templateUuid, nextDate]
    );
  });
  return { billUuid, nextGenerationDate: nextDate };
}
`;
  if (!analyzeGeneratorSource(BAD_NO_LOCK).length) {
    throw new Error(`[${LABEL}] selftest REGRESSION fixture (no lock, no CAS, separate connections) should FAIL but passed`);
  }

  const BAD_LOCK_BUT_NO_CAS = `
export async function generateFromTemplate(templateUuid, targetDate, actorUserId) {
  const { billUuid, nextGenerationDate, template } = await withLuciaBypass(async (client) => {
    const res = await client.query(
      \`SELECT * FROM accounting.recurring_bill_templates WHERE uuid = $1::uuid FOR UPDATE\`,
      [templateUuid]
    );
    const tmpl = res.rows[0];
    const bill = await createBill({ operatingCompanyId: tmpl.operating_company_id }, actorUserId);
    const billId = bill.id;
    const nextDate = computeNextGenerationDate(targetDate, tmpl.frequency);
    await client.query(
      \`
        UPDATE accounting.recurring_bill_templates
        SET next_generation_date = $2::date, updated_at = now()
        WHERE uuid = $1::uuid
      \`,
      [templateUuid, nextDate]
    );
    return { billUuid: billId, nextGenerationDate: nextDate, template: tmpl };
  });
  return { billUuid, nextGenerationDate };
}
`;
  if (!analyzeGeneratorSource(BAD_LOCK_BUT_NO_CAS).length) {
    throw new Error(`[${LABEL}] selftest REGRESSION fixture (locked but no CAS on the UPDATE) should FAIL but passed`);
  }

  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly`);
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — generateFromTemplate locks the template row FOR UPDATE for the entire generate+advance sequence, with a CAS-guarded next_generation_date update`);
