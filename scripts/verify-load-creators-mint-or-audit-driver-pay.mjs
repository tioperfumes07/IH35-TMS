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
  // ACCT-F277 closed the mdata create + delivery path via ensureDriverBillArtifactsForLoad — do not
  // re-list apps/backend/src/mdata/loads.routes.ts. NOT listed: integrations/edi/.../inbound-204 —
  // it never writes assigned_primary_driver_id (no driver to pay / skip-audit).
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
    // Direct mint/skip OR the ACCT-F277 canonical re-entry (delivery + secondary creators).
    const keepsPromise =
      (PAY_REFS.some((r) => code.includes(r)) && code.includes(SKIP_AUDIT)) ||
      code.includes("ensureDriverBillArtifactsForLoad");
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

/**
 * ACCT-F277 — delivery must re-enter the same idempotent mint. Create-time-only pay left every
 * secondary-created load permanently unpaid once it reached delivered*.
 */
export function collectDeliveryBackstopProblems(files) {
  const problems = [];
  const required = [
    "apps/backend/src/dispatch/loads.routes.ts",
    "apps/backend/src/mdata/loads.routes.ts",
  ];
  const byRel = new Map(files.map((f) => [f.rel, strip(f.src)]));
  for (const rel of required) {
    const code = byRel.get(rel) ?? "";
    if (!code.includes("ensureDriverBillArtifactsForLoad")) {
      problems.push(
        `${rel}: delivery/status path missing ensureDriverBillArtifactsForLoad — driver pay cannot ` +
          `recover after a secondary create (ACCT-F277 / DELIVERED-LOAD-NO-DRIVER-PAY).`
      );
    }
    if (!code.includes("loadStatusRequiresDeliveryDepartureStamp")) {
      problems.push(
        `${rel}: missing loadStatusRequiresDeliveryDepartureStamp — cannot prove pay is latched on delivery.`
      );
    }
  }
  if (!((byRel.get("apps/backend/src/dispatch/book-load.service.ts") ?? "").includes(
    "export async function ensureDriverBillArtifactsForLoad"
  ))) {
    problems.push(
      "apps/backend/src/dispatch/book-load.service.ts: ensureDriverBillArtifactsForLoad export missing — " +
        "delivery/mdata re-entry has no canonical mint."
    );
  }
  return problems;
}


/**
 * MILES-ON-BOOK — skip must be operator-visible, not audit-only.
 */
export function collectMilesOnBookLoudProblems() {
  const problems = [];
  const read = (rel) => {
    const fp = path.join(root, rel);
    return fs.existsSync(fp) ? fs.readFileSync(fp, "utf8") : "";
  };
  const book = read("apps/backend/src/dispatch/book-load.service.ts");
  const routes = read("apps/backend/src/dispatch/loads.routes.ts");
  const bookFe = read("apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx");
  const kanban = read("apps/frontend/src/components/dispatch/DispatchKanban.tsx");
  if (!book.includes("DriverBillMintOutcome") || !book.includes("skipped_no_pay_rate")) {
    problems.push("book-load.service.ts: DriverBillMintOutcome / skipped_no_pay_rate missing.");
  }
  if (!book.includes("driver_bill_mint")) {
    problems.push("book-load.service.ts: book response must include driver_bill_mint.");
  }
  if (!routes.includes("driver_bill_mint") || !routes.includes("driverBillOutcome")) {
    problems.push("loads.routes.ts: must return driver_bill_mint from transition (MILES-ON-BOOK).");
  }
  if (!bookFe.includes("driver_bill_mint") || !bookFe.includes("skipped_no_pay_rate")) {
    problems.push("BookLoadModalV4.tsx: must toast skipped_no_pay_rate.");
  }
  problems.push(...collectDriverBillSkipMessageProblems(bookFe));
  if (!kanban.includes("driver_bill_mint") || !kanban.includes("skipped_no_pay_rate")) {
    problems.push("DispatchKanban.tsx: must toast delivery pay skip.");
  }
  return problems;
}

export function collectDriverBillSkipMessageProblems(bookFe) {
  const problems = [];
  if (!bookFe.includes("function driverBillMintSkippedMessage") || (bookFe.match(/driverBillMintSkippedMessage/g) ?? []).length !== 3) {
    problems.push("BookLoadModalV4.tsx: skipped driver-pay result must use one shared message contract.");
  }
  if (!bookFe.includes('"a configured driver pay rate"')) {
    problems.push("BookLoadModalV4.tsx: empty missing[] must identify the configured pay rate, not generic pay inputs.");
  }
  if (!bookFe.includes("driver pay rate / mile and the load's pay-basis miles")) {
    problems.push("BookLoadModalV4.tsx: recovery must name both possible pay inputs.");
  }
  if (bookFe.includes("Enter shortest miles before delivery")) {
    problems.push("BookLoadModalV4.tsx: must not prescribe shortest miles when empty missing[] means the rate is absent.");
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
      : [...collectProblems(files), ...collectDeliveryBackstopProblems(files), ...collectMilesOnBookLoudProblems()];
    const ok = c.expect === 0 ? problems.length === 0 : problems.length >= (c.expectAtLeast ?? 1);
    if (ok) pass += 1;
    else console.error(`  selftest FAIL: ${c.name} -> ${JSON.stringify(problems)}`);
  }
  // ACCT-F277 delivery ratchet — empty stubs must fail.
  {
    const bad = collectDeliveryBackstopProblems([
      { rel: "apps/backend/src/dispatch/loads.routes.ts", src: "export const x = 1" },
      { rel: "apps/backend/src/mdata/loads.routes.ts", src: "export const y = 1" },
      { rel: "apps/backend/src/dispatch/book-load.service.ts", src: "export async function createDriverBillArtifacts() {}" },
    ]);
    if (bad.length >= 1) pass += 1;
    else console.error("  selftest FAIL: delivery backstop empty stubs");
  }
  {
    const loud = collectMilesOnBookLoudProblems();
    if (loud.length === 0) pass += 1;
    else console.error("  selftest FAIL: miles-on-book loud on real tree", loud);
  }
  const realBookFe = fs.readFileSync(
    path.join(root, "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx"),
    "utf8"
  );
  const messageMutations = [
    realBookFe.replace("driverBillMintSkippedMessage", "inlineSkippedMessage"),
    realBookFe.replace('"a configured driver pay rate"', '"pay inputs"'),
    realBookFe.replace("driver pay rate / mile and the load's pay-basis miles", "shortest miles"),
    `${realBookFe}\n// Enter shortest miles before delivery`,
  ];
  for (const mutant of messageMutations) {
    if (collectDriverBillSkipMessageProblems(mutant).length > 0) pass += 1;
    else console.error("  selftest FAIL: driver-pay recovery mutation survived");
  }
  const total = cases.length + 2 + messageMutations.length;
  console.log(`${LABEL} selftest ${pass}/${total}`);
  return pass === total ? 0 : 1;
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`${LABEL}: FAIL — ${SRC_DIR} not found`);
    return 1;
  }
  const tree = readTree();
  const problems = [...collectProblems(tree), ...collectDeliveryBackstopProblems(tree), ...collectMilesOnBookLoudProblems()];
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
