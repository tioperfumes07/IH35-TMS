#!/usr/bin/env node
/**
 * DRV-03 PART 1 FOLLOW-UP (owner packet, 2026-09-04): "A driver cannot be created without the DQ
 * file items the FMCSA requires, and the sequence is enforced server-side, not just in React."
 *
 * CreateDriverModal.tsx already blocks Save on any active compliance.required_document_types
 * (entity_kind='driver') item with enforcement='hard_block' the driver would not satisfy — but
 * that is a client-side gate, trivially bypassed by calling POST /api/v1/mdata/drivers directly.
 * createDriverCanonical (the single INSERT path both the office and maintenance routes delegate
 * to) now runs the SAME check against the SAME live catalog before the INSERT, for the office
 * hire flow (b.operating_company_id present) only.
 *
 * This guard locks: the gate queries the live catalog (not a hardcoded list), gates on
 * enforcement = 'hard_block' (not a wider or narrower predicate), runs BEFORE the INSERT INTO
 * mdata.drivers (not after — a driver row must never exist first), and the route handler maps
 * the resulting error to 409 with a human-readable message (not silently swallowed into the
 * generic 400 fallback, which would drop the `missing` array).
 *
 * Run: node scripts/verify-drv03-server-side-dqf-hard-block-gate.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-drv03-server-side-dqf-hard-block-gate";
const REL = "apps/backend/src/mdata/drivers.routes.ts";

export function run(root = ROOT) {
  const problems = [];
  let src;
  try {
    src = fs.readFileSync(path.join(root, REL), "utf8");
  } catch {
    return [`${REL}: missing`];
  }

  if (!/FROM compliance\.required_document_types/.test(src)) {
    problems.push(`${REL}: no live compliance.required_document_types query found — the server-side gate regressed to a hardcoded list or was removed`);
  }
  if (!/enforcement\s*=\s*'hard_block'/.test(src)) {
    problems.push(`${REL}: gate no longer filters on enforcement = 'hard_block'`);
  }
  if (!/driver_dqf_required_document_missing/.test(src)) {
    problems.push(`${REL}: driver_dqf_required_document_missing error code missing`);
  }
  if (!/status: 409,[\s\S]{0,120}driver_dqf_required_document_missing/.test(src)) {
    problems.push(`${REL}: driver_dqf_required_document_missing must map to 409, not fall through to the generic 400`);
  }

  // Ordering: the hard_block query must appear BEFORE the driver INSERT, never after.
  const gateIdx = src.indexOf("FROM compliance.required_document_types");
  const insertIdx = src.indexOf("INSERT INTO mdata.drivers (");
  if (gateIdx === -1 || insertIdx === -1 || gateIdx > insertIdx) {
    problems.push(`${REL}: the DQF hard_block gate must run BEFORE the INSERT INTO mdata.drivers, not after`);
  }

  return problems;
}

function selftest() {
  const dir = fs.mkdtempSync("/tmp/drv03-server-gate-selftest-");
  const write = (content) => {
    const abs = path.join(dir, REL);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };

  const fixed = `
    if (b.operating_company_id) {
      const hardBlockRes = await client.query(
        \`SELECT code, label FROM compliance.required_document_types
          WHERE operating_company_id = $1::uuid AND entity_kind = 'driver' AND is_active = true
            AND enforcement = 'hard_block'\`,
        [b.operating_company_id]
      );
      if (hardBlockRes.rows.length > 0) {
        return { error: "driver_dqf_required_document_missing" as const, missing: [] };
      }
    }
    const res = await client.query(\`INSERT INTO mdata.drivers (id) VALUES ($1)\`, [1]);
    if (created.error === "driver_dqf_required_document_missing") {
      return { status: 409, body: { error: "driver_dqf_required_document_missing", missing: created.missing } };
    }
  `;
  write(fixed);
  const clean = run(dir);
  if (clean.length) throw new Error("PASS fail (should be clean): " + JSON.stringify(clean));

  // Regress: gate removed entirely.
  write(`const res = await client.query(\`INSERT INTO mdata.drivers (id) VALUES ($1)\`, [1]);`);
  const removed = run(dir);
  if (!removed.some((p) => p.includes("hardcoded list or was removed"))) {
    throw new Error("FAIL to catch: gate removal went undetected");
  }

  // Regress: gate moved to AFTER the insert.
  write(`
    const res = await client.query(\`INSERT INTO mdata.drivers (id) VALUES ($1)\`, [1]);
    if (b.operating_company_id) {
      const hardBlockRes = await client.query(
        \`SELECT code, label FROM compliance.required_document_types WHERE entity_kind = 'driver' AND enforcement = 'hard_block'\`,
        [b.operating_company_id]
      );
      if (hardBlockRes.rows.length > 0) return { error: "driver_dqf_required_document_missing" as const, missing: [] };
    }
    if (created.error === "driver_dqf_required_document_missing") {
      return { status: 409, body: { error: "driver_dqf_required_document_missing", missing: created.missing } };
    }
  `);
  const afterInsert = run(dir);
  if (!afterInsert.some((p) => p.includes("must run BEFORE"))) {
    throw new Error("FAIL to catch: gate-after-insert regression went undetected");
  }

  // Regress: error code falls through to the generic 400 (missing array silently dropped).
  write(`
    if (b.operating_company_id) {
      const hardBlockRes = await client.query(
        \`SELECT code, label FROM compliance.required_document_types WHERE entity_kind = 'driver' AND enforcement = 'hard_block'\`,
        [b.operating_company_id]
      );
      if (hardBlockRes.rows.length > 0) return { error: "driver_dqf_required_document_missing" as const, missing: [] };
    }
    const res = await client.query(\`INSERT INTO mdata.drivers (id) VALUES ($1)\`, [1]);
    return { status: 400, body: { error: String(created.error) } };
  `);
  const genericFallback = run(dir);
  if (!genericFallback.some((p) => p.includes("must map to 409"))) {
    throw new Error("FAIL to catch: 409 mapping silently dropped went undetected");
  }

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`${LABEL} --selftest OK`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const problems = run();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — driver creation enforces the live DQF hard_block catalog server-side, before the INSERT, mapped to 409`);
