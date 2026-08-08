#!/usr/bin/env node
/**
 * GUARD (ratchet): a path that creates a load with a driver must either MINT driver pay or AUDIT the skip.
 *
 * Board card (dispatch lane, CC-3): "revenue recognized with NO driver cost and NO recorded reason."
 *
 * MEASURED ON PROD, not inferred:
 *   `LUSMCAFREIGHT-20260806-0001` carries an `earn` revrec posting (DR 1150 / CR 4000, $1.00) and an
 *   assigned driver, with ZERO driver payable and ZERO skip audit. Revenue posted with no cost side and
 *   no trace that anything was skipped.
 *
 * WHY THE PROMISE IS REAL ON ONE PATH AND ABSENT ON THE OTHERS (counts on main, comments stripped):
 *   dispatch/book-load.service.ts      pay refs 7   skip audit 1   <- keeps the promise
 *   mdata/loads.routes.ts              pay refs 0   skip audit 0
 *   integrations/edi/.../inbound-204   pay refs 0   skip audit 0
 *   accounting/revrec-delivery-posting pay refs 0   skip audit 0   (posts revenue, driver-pay blind)
 *
 * `book-load.service.ts` correctly REFUSES to derive driver pay from the customer rate (locked driver
 * model: wage/fee, never a % of linehaul) and emits `driver_finance.driver_bill.skipped_no_pay_rate`
 * with the reason. That audit event is the control: it is what makes "no driver bill" an explained
 * outcome instead of a silent hole. 17 such events exist on prod. The other creators emit nothing.
 *
 * SO THE ASSERTION IS NOT "always create a driver bill" — that would be wrong, and would push authors
 * to derive pay from the customer rate, which is the exact thing the driver model forbids. It is:
 * whoever seats a driver on a load must leave a RECORD either way.
 *
 * WHY A RATCHET: the three uncovered creators are an open P1 owned by the dispatch write-path seat, not
 * by this guard. A hard assert would ship red and block unrelated PRs, which is how guards get deleted.
 * The gaps are listed with reasons; the guard fails when the LIST is wrong — a new load creator appears,
 * or a listed one starts keeping the promise (delete its entry). The register may only shrink.
 *
 * NOT COVERED, stated so a green is not over-read: miles capture. Every load created since 2026-08-06
 * has `miles_shortest` NULL while all 5 active pay rates are per-mile, so pay cannot compute even on the
 * good path — `L-20260802-0258` proves the wiring works when miles exist (2300 mi x 48c = 110,400c
 * exactly). That is a data-capture defect, not something source-grep can assert.
 *
 * Run:  node scripts/verify-load-creators-mint-or-audit-driver-pay.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = path.join(root, "apps/backend/src");
const LABEL = "verify-load-creators-mint-or-audit-driver-pay";

const PAY_REFS = ["resolveDriverBasePayCents", "driver_bills"];
const SKIP_AUDIT = "skipped_no_pay_rate";

const KNOWN_GAPS = new Map([
  [
    "apps/backend/src/mdata/loads.routes.ts",
    "OPEN P1: creates loads WITH a driver, never mints pay and never audits a skip. Owner: dispatch write-path.",
  ],
  // NOT listed: integrations/edi/.../inbound-204.handler.ts. The board card names it as driver-pay
  // blind and that is true, but it never writes `assigned_primary_driver_id` — it creates loads with
  // NO driver, so there is no driver to pay and nothing to skip-audit. Listing it would have been a
  // false exemption implying a gap that does not exist. Caught by this guard's own stale-entry arm.
  [
    "apps/backend/src/seed/csv-seed-import.ts",
    "Bulk seed importer, not an operator surface - imported rows are exempt by the row-origin ruling.",
  ],
  [
    "apps/backend/src/onboarding/seed-sample-data.ts",
    "Sample-data seeder; rows it writes are fixtures by construction.",
  ],
]);

const strip = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      walk(p, out);
    } else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** In scope: creates a load AND can seat a driver. */
export function collectProblems(files) {
  const problems = [];
  const inScope = [];

  for (const { rel, src } of files) {
    const code = strip(src);
    if (!/INSERT\s+INTO\s+mdata\.loads/i.test(code)) continue;
    if (!/assigned_primary_driver_id/.test(code)) continue;
    const keepsPromise =
      PAY_REFS.some((r) => code.includes(r)) && code.includes(SKIP_AUDIT);
    inScope.push({ rel, keepsPromise });
  }

  for (const { rel, keepsPromise } of inScope) {
    const known = KNOWN_GAPS.has(rel);
    if (!keepsPromise && !known) {
      problems.push(
        `${rel}: seats a driver on a load but neither mints driver pay (${PAY_REFS.join(" / ")}) nor audits the ` +
          `skip (${SKIP_AUDIT}). Revenue can post with no cost side and no recorded reason — wire the pay/skip ` +
          `path or add it to KNOWN_GAPS with a reason.`
      );
    }
    if (keepsPromise && known) {
      problems.push(
        `${rel}: now mints or audits driver pay — remove it from KNOWN_GAPS so the ratchet cannot slip back.`
      );
    }
  }

  for (const rel of KNOWN_GAPS.keys()) {
    if (!inScope.some((f) => f.rel === rel)) {
      problems.push(`${rel}: listed in KNOWN_GAPS but no longer creates loads with a driver — delete the entry.`);
    }
  }
  return problems;
}

function readTree() {
  return walk(SRC_DIR).map((f) => ({ rel: path.relative(root, f), src: fs.readFileSync(f, "utf8") }));
}

function selftest() {
  const INS = "INSERT INTO mdata.loads (operating_company_id, assigned_primary_driver_id)";
  const mk = (rel, src) => ({ rel, src });
  const cases = [
    { name: "real tree passes", files: null, expect: 0 },
    {
      name: "a NEW creator with neither pay nor skip audit is caught",
      files: [mk("apps/backend/src/dispatch/new-creator.ts", `await c.query(\`${INS}\`)`)],
      expectAtLeast: 1,
    },
    {
      name: "pay WITHOUT the skip audit is still caught (silent hole is the defect)",
      files: [mk("apps/backend/src/dispatch/x.ts", `resolveDriverBasePayCents(); await c.query(\`${INS}\`)`)],
      expectAtLeast: 1,
    },
    {
      name: "pay AND skip audit passes",
      files: [
        mk("apps/backend/src/dispatch/y.ts", `resolveDriverBasePayCents(); log('${SKIP_AUDIT}'); await c.query(\`${INS}\`)`),
      ],
      expect: 0,
    },
    {
      name: "a load INSERT with no driver column is out of scope",
      files: [mk("apps/backend/src/z.ts", "await c.query(`INSERT INTO mdata.loads (operating_company_id)`)")],
      expect: 0,
    },
    {
      name: "comment-only mention does not satisfy the guard",
      files: [mk("apps/backend/src/dispatch/w.ts", `// resolveDriverBasePayCents ${SKIP_AUDIT}\nawait c.query(\`${INS}\`)`)],
      expectAtLeast: 1,
    },
  ];

  let pass = 0;
  for (const c of cases) {
    const files = c.files ?? readTree();
    const problems = c.files
      ? collectProblems(files).filter((p) => !p.includes("no longer creates loads"))
      : collectProblems(files);
    const ok = c.expect === 0 ? problems.length === 0 : problems.length >= (c.expectAtLeast ?? 1);
    if (ok) pass += 1;
    else console.error(`  selftest FAIL: ${c.name} -> ${JSON.stringify(problems)}`);
  }
  console.log(`${LABEL} selftest ${pass}/${cases.length}`);
  return pass === cases.length ? 0 : 1;
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`${LABEL}: FAIL — ${SRC_DIR} not found`);
    return 1;
  }
  const problems = collectProblems(readTree());
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log(`${LABEL}: ok`);
  for (const [rel, why] of KNOWN_GAPS) console.log(`  KNOWN GAP (must shrink) — ${rel}\n      ${why}`);
  return 0;
}

process.exit(main());
