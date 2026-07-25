#!/usr/bin/env node
/**
 * ACCT-R-01 (0007-pattern-5 escrow split-brain finding) — escrow balance sync guard.
 *
 * WHAT THIS CATCHES: docs/specs/DESIGN-HOLD-0007-ESCROW-SPLIT-BRAIN-2026-07-21.md flagged the parallel
 * accounting.escrow_* / driver_finance.escrow_* schemas as a "split-brain" risk and asked which is
 * canonical. Live code archaeology (not guesswork) found the REAL defect: it is not two competing
 * ledgers — driver_finance.escrow_balances/escrow_ledger is the legitimate operational per-driver
 * running-balance store (banking escrow visualizer, driver escrow history tab, pre-settlements
 * deductions queue, and the $2,000 settlement-cap check all read it), while accounting.escrow_accounts.
 * balance_cents is the GL-LINKED liability balance driver-finance/escrow-separation.service.ts's
 * releaseDriverEscrowSeparation() reads as authoritative before calling releaseEscrow(). The two were
 * NEVER kept in sync: every contribution/hold landed ONLY in driver_finance.*, so
 * accounting.escrow_accounts.balance_cents stayed at 0 forever — meaning a real driver's escrow would
 * release as $0 (or throw escrow_release_exceeds_balance) on separation, despite the JE having correctly
 * credited the liability account all along. This guard makes that asymmetry structurally impossible to
 * reintroduce: ANY backend source file that INSERTs/UPDATEs driver_finance.escrow_balances or
 * driver_finance.escrow_ledger (a contribution/hold write) MUST also reference the canonical GL sync
 * (accounting.escrow_accounts / accounting.escrow_postings / recordEscrowPostingOnly) in the SAME file,
 * or carry an explicit `ESCROW-SYNC-EXEMPT:` comment naming why the sync is intentionally not needed
 * there (e.g. a read-only file, a test fixture, or a release-side file that already correctly reads
 * accounting.escrow_accounts instead of writing driver_finance.*).
 *
 * Additive only. No migration, no GL math, no flag — enforcement infra only.
 * Self-test: node scripts/verify-acct-r01-escrow-canonical-write-path.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND_SRC = path.join(ROOT, "apps", "backend", "src");

const DRIVER_FINANCE_ESCROW_WRITE_RE = /\b(?:INSERT\s+INTO|UPDATE)\s+driver_finance\.escrow_(?:balances|ledger)\b/i;
const CANONICAL_SYNC_RE = /accounting\.escrow_postings|accounting\.escrow_accounts|recordEscrowPostingOnly/;
const EXEMPT_RE = /ESCROW-SYNC-EXEMPT:/;

/** True iff `relPath` (posix-style, relative to apps/backend/src) is a test file/dir — never evaluated. */
function isTestPath(relPath) {
  return /__tests__|\.test\.ts$|\.spec\.ts$/.test(relPath);
}

function walkTsFiles(dir, root, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsFiles(full, root, out);
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  }
  return out;
}

/**
 * Core evaluation — pure. `files` is a Record<relPath, content> so --selftest can drive it with
 * synthetic fixtures without touching disk.
 * @returns {{errors: string[], evaluated: string[]}}
 */
export function assertEscrowBalanceStaysSynced(files) {
  const errors = [];
  const evaluated = [];
  for (const [relPath, content] of Object.entries(files)) {
    if (isTestPath(relPath)) continue;
    if (!DRIVER_FINANCE_ESCROW_WRITE_RE.test(content)) continue;
    evaluated.push(relPath);
    if (CANONICAL_SYNC_RE.test(content)) continue;
    if (EXEMPT_RE.test(content)) continue;
    errors.push(
      `${relPath}: writes driver_finance.escrow_balances/escrow_ledger (a contribution/hold) but never ` +
        `syncs the canonical GL liability balance (accounting.escrow_accounts / accounting.escrow_postings ` +
        `/ recordEscrowPostingOnly). This reintroduces the ACCT-R-01 asymmetry — driver escrow would ` +
        `release as $0 on separation. Fix: call recordEscrowPostingOnly() from ` +
        `apps/backend/src/accounting/escrow/service.ts after the driver_finance write, OR add an inline ` +
        `'ESCROW-SYNC-EXEMPT: <reason>' comment if this file genuinely does not need the sync.`
    );
  }
  return { errors, evaluated };
}

function realRun() {
  if (!fs.existsSync(BACKEND_SRC)) {
    console.error(`[verify-acct-r01-escrow-canonical-write-path] FAIL — ${BACKEND_SRC} not found`);
    process.exit(1);
  }
  const relFiles = walkTsFiles(BACKEND_SRC, BACKEND_SRC, []);
  const files = {};
  for (const rel of relFiles) {
    files[rel] = fs.readFileSync(path.join(BACKEND_SRC, rel), "utf8");
  }
  const { errors, evaluated } = assertEscrowBalanceStaysSynced(files);

  if (errors.length) {
    console.error(`[verify-acct-r01-escrow-canonical-write-path] FAIL — ${errors.length} issue(s):`);
    for (const e of errors) console.error(`  • ${e}`);
    process.exit(1);
  }
  console.log(
    `[verify-acct-r01-escrow-canonical-write-path] OK — ${relFiles.length} backend files scanned, ` +
      `${evaluated.length} driver_finance escrow-balance writer(s) found, all synced to ` +
      `accounting.escrow_accounts (ACCT-R-01).`
  );
}

// ───────────────────────── selftest ─────────────────────────

function selftest() {
  const cases = [
    {
      label: "(i) driver_finance write with NO accounting sync → FAIL",
      files: {
        "driver-finance/bad.service.ts": `
          await client.query(\`INSERT INTO driver_finance.escrow_balances (operating_company_id, driver_id) VALUES ($1,$2)\`, [a,b]);
        `,
      },
      expectFail: true,
    },
    {
      label: "(ii) driver_finance write + recordEscrowPostingOnly call → PASS",
      files: {
        "driver-finance/settlement-payrun-close.service.ts": `
          await client.query(\`INSERT INTO driver_finance.escrow_balances (operating_company_id, driver_id) VALUES ($1,$2)\`, [a,b]);
          await recordEscrowPostingOnly(client, { operating_company_id, driver_id, posting_type: "deposit" });
        `,
      },
      expectFail: false,
    },
    {
      label: "(iii) driver_finance write + explicit ESCROW-SYNC-EXEMPT comment → PASS",
      files: {
        "driver-finance/legacy.service.ts": `
          // ESCROW-SYNC-EXEMPT: test-fixture-only cleanup path, never runs in production.
          await client.query(\`UPDATE driver_finance.escrow_ledger SET amount_cents = $1\`, [a]);
        `,
      },
      expectFail: false,
    },
    {
      label: "(iv) read-only SELECT from driver_finance.escrow_balances → not evaluated (PASS)",
      files: {
        "driver-finance/escrow-resolver.service.ts": `
          const bal = await client.query(\`SELECT current_balance_cents FROM driver_finance.escrow_balances WHERE driver_id = $1\`, [id]);
        `,
      },
      expectFail: false,
      expectEvaluated: 0,
    },
    {
      label: "(v) __tests__ fixture write with no sync → never evaluated (PASS)",
      files: {
        "driver-finance/__tests__/foo.db.test.ts": `
          await db.query(\`INSERT INTO driver_finance.escrow_balances (driver_id) VALUES ($1)\`, [id]);
        `,
      },
      expectFail: false,
      expectEvaluated: 0,
    },
  ];

  let pass = 0;
  for (const c of cases) {
    const { errors, evaluated } = assertEscrowBalanceStaysSynced(c.files);
    const failed = errors.length > 0;
    const ok = failed === c.expectFail;
    const evalOk = c.expectEvaluated === undefined || evaluated.length === c.expectEvaluated;
    if (ok && evalOk) {
      pass++;
      console.log(`ok    ${c.label}`);
    } else {
      console.error(
        `FAIL  ${c.label} — expected ${c.expectFail ? "FAIL" : "PASS"}, got ${failed ? "FAIL" : "PASS"}` +
          (c.expectEvaluated !== undefined ? ` (evaluated=${evaluated.length}, expected=${c.expectEvaluated})` : "") +
          `\n      ${errors.join("\n      ")}`
      );
    }
  }
  console.log(
    `\nverify-acct-r01-escrow-canonical-write-path SELFTEST ${pass}/${cases.length} ${pass === cases.length ? "PASS" : "FAIL"}`
  );
  process.exit(pass === cases.length ? 0 : 1);
}

if (process.argv.includes("--selftest")) selftest();
else realRun();
