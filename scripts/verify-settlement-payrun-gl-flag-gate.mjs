#!/usr/bin/env node
/**
 * Settlement Pay-Run GL-posting flag-gate guard (Phase 4 GUARDS).
 *
 * Distinct from the pre-existing verify-settlement-gl-flag-gate.mjs (FIN-18 consent/floor gates on
 * settlement-posting.service.ts specifically) — this guard is the broader Phase 4 invariant: NO
 * settlement/escrow/advance GL posting anywhere under the settlement-posting engine may run unless
 * SETTLEMENT_GL_POSTING_ENABLED is ON. Locks:
 *   (1) Every posting entry-point in apps/backend/src/accounting/settlement-posting/ (the settlement
 *       posting engine — this is what the pay-run escrow/advance postings reuse per the migration
 *       202607380000 comment "posting reuses the existing settlement poster behind
 *       SETTLEMENT_GL_POSTING_ENABLED") must call isEnabled(..., SETTLEMENT_GL_POSTING_ENABLED, ...)
 *       BEFORE (earlier in the same file, textually) any INSERT INTO accounting.journal_entries /
 *       accounting.journal_entry_postings, or any createJournalEntry(...) call.
 *   (2) The SETTLEMENT_GL_POSTING_ENABLED flag is seeded in db/migrations with default_enabled = false
 *       (per-entity default OFF — only explicit per-entity overrides turn it on).
 *
 * --selftest exercises assertGuard() against inline fixtures (pass + each failure mode), including an
 * ORDER-sensitivity case (the gate must precede the posting call, not merely exist somewhere in the file).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-payrun-gl-flag-gate";
const MIGRATIONS_DIR = "db/migrations";
const SCAN_DIR = "apps/backend/src/accounting/settlement-posting";
const FLAG_KEY = "SETTLEMENT_GL_POSTING_ENABLED";

const GATE_RE = /isEnabled\([\s\S]{0,150}?(SETTLEMENT_GL_POSTING_ENABLED|SETTLEMENT_GL_POSTING_FLAG_KEY)/g;
const POSTING_RE =
  /INSERT\s+INTO\s+accounting\.journal_entries\b|INSERT\s+INTO\s+accounting\.journal_entry_postings\b|createJournalEntry\(/g;

/**
 * Pure evaluation.
 * @param {{ migrationsText: string, files: Array<{path:string, text:string}> }} args
 * @returns {string[]} errors
 */
export function assertGuard({ migrationsText, files }) {
  const errors = [];

  if (!new RegExp(`'${FLAG_KEY}'[\\s\\S]{0,600}?,\\s*false\\s*,`).test(migrationsText)) {
    errors.push(`${FLAG_KEY} must be seeded in db/migrations with default_enabled = false`);
  }

  for (const f of files) {
    const gateIdxs = [...f.text.matchAll(new RegExp(GATE_RE.source, "g"))].map((m) => m.index);
    const postIdxs = [...f.text.matchAll(new RegExp(POSTING_RE.source, "g"))].map((m) => m.index);
    for (const p of postIdxs) {
      const hasEarlierGate = gateIdxs.some((g) => g < p);
      if (!hasEarlierGate) {
        errors.push(
          `${f.path}: posts to accounting.journal_entries/journal_entry_postings without an EARLIER ` +
            `isEnabled(${FLAG_KEY}) gate in the same file`
        );
        break;
      }
    }
  }

  return errors;
}

function walkFiles(dirRel) {
  const abs = path.join(ROOT, dirRel);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) out.push(p);
    }
  };
  walk(abs);
  return out;
}

function scanMigrationsText() {
  const dir = path.join(ROOT, MIGRATIONS_DIR);
  if (!fs.existsSync(dir)) return "";
  let text = "";
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    text += fs.readFileSync(path.join(dir, f), "utf8") + "\n";
  }
  return text;
}

function buildFiles() {
  return walkFiles(SCAN_DIR).map((abs) => ({ path: path.relative(ROOT, abs), text: fs.readFileSync(abs, "utf8") }));
}

function selftest() {
  const goodMigrationsText = `
INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES ('SETTLEMENT_GL_POSTING_ENABLED', 'Driver settlement -> GL posting.', false, 0)
ON CONFLICT (flag_key) DO NOTHING;
`;
  const goodFile = {
    path: "apps/backend/src/accounting/settlement-posting/settlement-posting.service.ts",
    text: `
import { SETTLEMENT_GL_POSTING_FLAG_KEY } from "./settlement-posting.math.js";

export async function postSettlement(client, opco, actorUserId) {
  const flagOn = await isEnabled(client, SETTLEMENT_GL_POSTING_FLAG_KEY, { operating_company_id: opco, user_uuid: actorUserId });
  if (!flagOn) return { posted: false };
  await client.query(\`INSERT INTO accounting.journal_entries (id, operating_company_id) VALUES ($1, $2)\`);
  await client.query(\`INSERT INTO accounting.journal_entry_postings (journal_entry_uuid) VALUES ($1)\`);
  return { posted: true };
}
`,
  };

  const cases = [
    { name: "well-formed → 0 errors", in: { migrationsText: goodMigrationsText, files: [goodFile] }, want: 0 },
    {
      name: "flag missing default_enabled=false",
      in: { migrationsText: goodMigrationsText.replace(", false, 0", ", true, 0"), files: [goodFile] },
      wantMin: 1,
    },
    {
      name: "posting entry-point with NO isEnabled gate at all",
      in: {
        migrationsText: goodMigrationsText,
        files: [
          {
            path: goodFile.path,
            text: `
export async function postSettlement(client, opco) {
  await client.query(\`INSERT INTO accounting.journal_entries (id, operating_company_id) VALUES ($1, $2)\`);
  await client.query(\`INSERT INTO accounting.journal_entry_postings (journal_entry_uuid) VALUES ($1)\`);
  return { posted: true };
}
`,
          },
        ],
      },
      wantMin: 1,
    },
    {
      name: "ORDER-sensitive: gate exists but AFTER the INSERT (still fails)",
      in: {
        migrationsText: goodMigrationsText,
        files: [
          {
            ...goodFile,
            text: `
export async function postSettlement(client, opco, actorUserId) {
  await client.query(\`INSERT INTO accounting.journal_entries (id, operating_company_id) VALUES ($1, $2)\`);
  const flagOn = await isEnabled(client, SETTLEMENT_GL_POSTING_FLAG_KEY, { operating_company_id: opco });
  return { posted: true, flagOn };
}
`,
          },
        ],
      },
      wantMin: 1,
    },
    {
      name: "createJournalEntry(...) call with no earlier gate",
      in: {
        migrationsText: goodMigrationsText,
        files: [
          {
            path: "apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts",
            text: `
export async function postBillPayment(client, opco) {
  const je = await createJournalEntry({ operating_company_id: opco, postings: [] }, { userId: "x" });
  return je;
}
`,
          },
        ],
      },
      wantMin: 1,
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const n = assertGuard(c.in).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.wantMin;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}  (errors=${n})`);
  }
  if (failed) { console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }

const migrationsText = scanMigrationsText();
if (!migrationsText) {
  console.error(`[${LABEL}] FAILED — cannot read ${MIGRATIONS_DIR}`);
  process.exit(1);
}
const files = buildFiles();
if (files.length === 0) {
  console.error(`[${LABEL}] FAILED — no files found under ${SCAN_DIR}`);
  process.exit(1);
}
const errors = assertGuard({ migrationsText, files });
if (errors.length) {
  console.error(`[${LABEL}] FAILED — ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — every settlement-posting entry-point gates on isEnabled(${FLAG_KEY}) before any GL INSERT, flag default OFF.`);
