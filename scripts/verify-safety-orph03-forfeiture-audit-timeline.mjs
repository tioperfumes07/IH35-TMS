#!/usr/bin/env node
/**
 * SAF-ORPH-03 — Forfeiture Audit panel must be able to render escrow timeline rows.
 *
 * Root defect (2026-07-25): driver_finance.escrow_ledger has created_at but NO posted_at.
 * deductions.routes.ts ordered by posted_at → Postgres 42703 on every call, and
 * listEscrowRecords() swallowed failures into an empty timeline — the panel looked like
 * "no forfeitures" when the read was structurally broken.
 *
 * ACCT-GUARD-F7300 (2026-08-29): ACCT-F5703 deliberately repointed escrow-visualizer.routes.ts's
 * detail-timeline query OFF driver_finance.escrow_ledger (near-empty, never kept in sync, no JE
 * link of its own) ONTO accounting.escrow_postings — the real postings backing
 * accounting.escrow_accounts.balance_cents, already correctly linked to its GL journal entry via
 * linked_journal_entry_id. This guard's original check #1 required BOTH deductions.routes.ts AND
 * escrow-visualizer.routes.ts to query driver_finance.escrow_ledger — after ACCT-F5703, the
 * visualizer legitimately queries neither that table nor a phantom posted_at column (verified live
 * on Neon: accounting.escrow_postings genuinely HAS a posted_at column, unlike escrow_ledger), so
 * the guard was rejecting a correct, deliberate improvement. Root cause was the guard's own
 * assumption, not the code. Fixed by scoping check #1 to deductions.routes.ts only (still queries
 * escrow_ledger, still must never order by its nonexistent posted_at) and adding a companion check
 * for escrow-visualizer.routes.ts's actual canonical source: it must query
 * accounting.escrow_postings, LEFT JOIN accounting.journal_entries via linked_journal_entry_id
 * (preserving the JE lineage that is the whole point of the repoint), and scope by both
 * operating_company_id and driver/holder identity — the "company/driver scope" the finding asked
 * for. Do not restore the retired escrow_ledger query merely to satisfy the old guard.
 *
 * This guard locks all of:
 *   1. deductions.routes.ts's escrow_ledger reads order by created_at (never posted_at)
 *   2. escrow-visualizer.routes.ts's timeline reads use accounting.escrow_postings, joined to
 *      accounting.journal_entries, scoped by company + driver
 *   3. listEscrowRecords does not manufacture empty timelines from caught exceptions
 *   4. EscrowRecordTab surfaces timeline_errors when history is incomplete
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-orph03-forfeiture-audit-timeline";

const DEDUCTIONS_ROUTES = "apps/backend/src/driver-finance/deductions.routes.ts";
const ESCROW_VIZ_ROUTES = "apps/backend/src/banking/escrow-visualizer.routes.ts";
const DRIVER_FINANCE_API = "apps/frontend/src/api/driverFinance.ts";
const ESCROW_RECORD_TAB = "apps/frontend/src/pages/safety/tabs/EscrowRecordTab.tsx";

const FILES = [DEDUCTIONS_ROUTES, ESCROW_VIZ_ROUTES, DRIVER_FINANCE_API, ESCROW_RECORD_TAB];

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function extractEscrowLedgerSql(src) {
  const chunks = [];
  const re = /driver_finance\.escrow_ledger[\s\S]{0,1200}/gi;
  let m;
  while ((m = re.exec(src))) chunks.push(m[0]);
  return chunks;
}

export function assertOrph03(root = ROOT) {
  const problems = [];

  for (const rel of FILES) {
    if (!fs.existsSync(path.join(root, rel))) problems.push(`missing ${rel}`);
  }
  if (problems.length) return problems;

  // Check #1 — deductions.routes.ts is the ONLY remaining reader of driver_finance.escrow_ledger,
  // which genuinely has no posted_at column. escrow-visualizer.routes.ts was deliberately
  // repointed off this table by ACCT-F5703 and is checked separately below.
  {
    const rel = DEDUCTIONS_ROUTES;
    const src = stripComments(read(rel));
    const chunks = extractEscrowLedgerSql(src);
    if (chunks.length === 0) {
      problems.push(`${rel}: expected at least one driver_finance.escrow_ledger query`);
    }
    for (const chunk of chunks) {
      if (/order\s+by\s+(?:\w+\.)?posted_at/i.test(chunk)) {
        problems.push(
          `${rel}: driver_finance.escrow_ledger query orders by posted_at — column does not exist (Postgres 42703)`
        );
      }
      if (!/order\s+by\s+(?:\w+\.)?created_at/i.test(chunk)) {
        problems.push(`${rel}: driver_finance.escrow_ledger query must ORDER BY created_at`);
      }
    }
  }

  // Check #2 — escrow-visualizer.routes.ts's detail-timeline query (ACCT-F5703's canonical
  // replacement): must read accounting.escrow_postings, preserve the JE lineage via a
  // LEFT JOIN accounting.journal_entries ON linked_journal_entry_id, and stay scoped by both
  // operating_company_id and driver/holder identity — company+driver scope, mutation-proven
  // independently of the deductions.routes.ts check above.
  {
    const rel = ESCROW_VIZ_ROUTES;
    const src = stripComments(read(rel));
    // Anchor on "escrow_postings ep" — unique to the detail-timeline query (the list endpoint
    // above it in the same file never mentions escrow_postings at all), so this can't accidentally
    // match the unrelated list-endpoint query the way an "accounting.escrow_accounts" anchor did
    // (both endpoints reference that table).
    if (!/join\s+accounting\.escrow_postings\s+ep/i.test(src)) {
      problems.push(`${rel}: detail-timeline query must JOIN accounting.escrow_postings (ACCT-F5703 canonical source)`);
    }
    if (!/left\s+join\s+accounting\.journal_entries[\s\S]{0,120}linked_journal_entry_id/i.test(src)) {
      problems.push(`${rel}: detail-timeline query must LEFT JOIN accounting.journal_entries via linked_journal_entry_id — losing this drops the GL lineage that is the whole point of the repoint`);
    }
    if (!/"ea\.operating_company_id\s*=\s*\$1::uuid"/i.test(src)) {
      problems.push(`${rel}: detail-timeline query must stay scoped by operating_company_id`);
    }
    if (!/"ea\.holder_id\s*=\s*\$2"/i.test(src)) {
      problems.push(`${rel}: detail-timeline query must stay scoped to the requested driver (holder_id)`);
    }
  }

  const driverFinance = stripComments(read(DRIVER_FINANCE_API));
  if (/getEscrowDriverTimeline[\s\S]{0,500}\(\s*\(\)\s*=>\s*\(\{\s*ok:\s*true[\s\S]{0,80}timeline:\s*\[\]/.test(
    driverFinance
  )) {
    problems.push(
      `${DRIVER_FINANCE_API}: listEscrowRecords must not treat timeline failures as ok:true with an empty timeline`
    );
  }
  if (!/ok:\s*false\s+as\s+const,\s*error:/.test(driverFinance)) {
    problems.push(`${DRIVER_FINANCE_API}: timeline failures must return ok:false with an error message`);
  }
  if (!/timeline_errors/.test(driverFinance)) {
    problems.push(`${DRIVER_FINANCE_API}: listEscrowRecords must return timeline_errors for partial audit honesty`);
  }

  const tab = read(ESCROW_RECORD_TAB);
  if (!/data-testid="escrow-forfeit-audit-errors"/.test(tab)) {
    problems.push(`${ESCROW_RECORD_TAB}: must surface timeline_errors — incomplete audit must not look empty`);
  }

  return problems;
}

function selftest() {
  const baseline = assertOrph03();
  if (baseline.length) {
    console.error(`SELFTEST FAIL: repository already red.\n  - ${baseline.join("\n  - ")}`);
    process.exit(1);
  }

  const cases = [
    {
      name: "posted_at resurrected on escrow_ledger read",
      file: DEDUCTIONS_ROUTES,
      find: "ORDER BY created_at DESC LIMIT 200",
      replace: "ORDER BY posted_at DESC LIMIT 200",
    },
    {
      name: "escrow-visualizer.routes.ts drops the escrow_postings join (reverts toward the retired source)",
      file: ESCROW_VIZ_ROUTES,
      find: "JOIN accounting.escrow_postings ep",
      replace: "JOIN accounting.escrow_ledger ep",
    },
    {
      name: "escrow-visualizer.routes.ts drops the journal_entries JE-lineage join",
      file: ESCROW_VIZ_ROUTES,
      find: `LEFT JOIN accounting.journal_entries je
              ON je.id = ep.linked_journal_entry_id`,
      replace: `LEFT JOIN accounting.journal_entries je
              ON je.id = ep.id`,
    },
    {
      name: "escrow-visualizer.routes.ts drops company scope on the detail-timeline query",
      file: ESCROW_VIZ_ROUTES,
      find: '"ea.operating_company_id = $1::uuid",',
      replace: '"1 = 1",',
    },
    {
      name: "escrow-visualizer.routes.ts drops driver scope on the detail-timeline query",
      file: ESCROW_VIZ_ROUTES,
      find: '"ea.holder_id = $2",',
      replace: '"1 = 1",',
    },
    {
      name: "timeline failures treated as empty success",
      file: DRIVER_FINANCE_API,
      find: "(err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) })",
      replace: "() => ({ ok: true as const, payload: { timeline: [] } })",
    },
    {
      name: "EscrowRecordTab stops surfacing timeline_errors",
      file: ESCROW_RECORD_TAB,
      find: 'data-testid="escrow-forfeit-audit-errors"',
      replace: 'data-testid="escrow-forfeit-audit-errors-removed"',
    },
  ];

  for (const c of cases) {
    const abs = path.join(ROOT, c.file);
    const original = fs.readFileSync(abs, "utf8");
    if (!original.includes(c.find)) {
      console.error(`SELFTEST FAIL: anchor for "${c.name}" not found`);
      process.exit(1);
    }
    try {
      fs.writeFileSync(abs, original.replace(c.find, c.replace), "utf8");
      const caught = assertOrph03();
      if (caught.length === 0) {
        console.error(`SELFTEST FAIL: "${c.name}" not caught`);
        process.exit(1);
      }
      console.log(`  caught: ${c.name}`);
    } finally {
      fs.writeFileSync(abs, original, "utf8");
    }
  }

  console.log(`SELFTEST PASS: all ${cases.length} planted defects caught, restore green.`);
}

const problems = assertOrph03();
if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

if (problems.length) {
  console.error(`${LABEL} FAIL:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}

console.log(`${LABEL} OK — escrow timeline reads use created_at; forfeiture audit does not swallow failures.`);
