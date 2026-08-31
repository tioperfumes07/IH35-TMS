#!/usr/bin/env node
/**
 * GUARD: no driver-pay preview may be computed from the CUSTOMER charge total.
 *
 * WIRE-02 / ACCT-F63 removed "driver pay = the customer rate" from the backend
 * (book-load.service.ts). It survived in the FE: BookLoadModalV4's `driverBillPreview` fell back to
 * `sectionTotal + extraRatesCents` — the identical expression assigned to `customerInvoiceTotal`
 * eight lines above — whenever miles or the per-mile rate were missing.
 *
 * Measured on prod (br-fancy-credit-akjnd07a, 2026-08-09): USMCA had 25 live loads, 24 with no
 * shortest miles, 22 with none at all, against 22 carrying a customer rate; 18
 * `driver_finance.driver_bill.skipped_no_pay_rate` audit events and 2 USMCA driver bills. The
 * fallback was therefore the NORMAL case, and it showed a figure the backend refuses to mint.
 *
 * Two ways this class returns, so the guard checks both:
 *   1. a *_pay / *_bill / driverBill* preview binding whose body reads a customer-total identifier;
 *   2. that specific memo losing its not-priceable branch (it must be able to yield null).
 *
 * A preview MAY read miles and the driver's own per-mile rate. It may never read the charges the
 * CUSTOMER is invoiced.
 *
 * Run:  node scripts/verify-driver-pay-preview-not-customer-total.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(root, "apps/frontend/src");
const LABEL = "verify-driver-pay-preview-not-customer-total";

/** Identifiers that hold what the CUSTOMER is billed. Reading one to price a DRIVER is the defect. */
const CUSTOMER_TOTAL_IDENTS = [
  "customerInvoiceTotal",
  "sectionTotal",
  "extraRatesCents",
  "rate_total_cents",
  "rateTotalCents",
  "linehaul",
];

/** A binding whose name says it previews driver pay. */
const DRIVER_PAY_BINDING = /\b(?:const|let)\s+(driverBill\w*|driverPay\w*|\w*DriverPay\w*|\w*DriverBill\w*)\s*=/;

const strip = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__") continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * The body of a `const X = ...;` binding, by brace/paren depth — a line-window would either miss a
 * long memo or bleed into the next one, and this class hides in the LAST line of the body.
 */
export function bindingBody(code, startIndex) {
  let depth = 0;
  for (let i = startIndex; i < code.length; i += 1) {
    const c = code[i];
    if (c === "(" || c === "{" || c === "[") depth += 1;
    else if (c === ")" || c === "}" || c === "]") depth -= 1;
    else if (c === ";" && depth <= 0) return code.slice(startIndex, i);
  }
  return code.slice(startIndex);
}

export function collectProblems(files) {
  const problems = [];
  let sawTheMemo = false;

  for (const { rel, src } of files) {
    const code = strip(src);
    const re = new RegExp(DRIVER_PAY_BINDING.source, "g");
    let m;
    while ((m = re.exec(code)) !== null) {
      const name = m[1];
      const body = bindingBody(code, m.index);
      // Only previews/derived amounts — not handlers, refs, or field registrations.
      if (!/Preview|Cents|Amount|Total/i.test(name)) continue;

      for (const ident of CUSTOMER_TOTAL_IDENTS) {
        if (new RegExp(`\\b${ident}\\b`).test(body)) {
          problems.push(
            `${rel}: \`${name}\` reads \`${ident}\` — a CUSTOMER charge total — to derive DRIVER pay. ` +
              `That is WIRE-02/ACCT-F63 (driver billed the customer rate), and it also promises a figure ` +
              `the backend refuses to mint (it writes driver_bill.skipped_no_pay_rate instead). Show ` +
              `not-priceable as not-priceable; never substitute the customer's number.`
          );
        }
      }

      if (rel.endsWith("pages/dispatch/components/BookLoadModalV4.tsx") && name === "driverBillPreview") {
        sawTheMemo = true;
        if (!/return\s+null/.test(body)) {
          problems.push(
            `${rel}: \`driverBillPreview\` no longer has a not-priceable branch (\`return null\`). Without ` +
              `it the memo must return SOME number when miles or the rate are missing, and the only ` +
              `numbers in scope are the customer's.`
          );
        }
      }
    }

    if (
      rel.endsWith("pages/dispatch/components/BookLoadModalV4.tsx") &&
      src.includes('data-testid="book-load-driver-bill-not-priceable"')
    ) {
      if (/no driver bill will be created/i.test(src)) {
        problems.push(
          `${rel}: missing per-load preview claims no driver bill will be created, but submit-time pricing may use the active driver rate card.`
        );
      }
      if (!/active driver rate card/i.test(src) || !/skipped-no-rate event/i.test(src)) {
        problems.push(
          `${rel}: unavailable preview copy must disclose both submit-time active-rate-card fallback and the honest skipped-no-rate outcome.`
        );
      }
    }
  }

  if (files.some((f) => f.rel.endsWith("pages/dispatch/components/BookLoadModalV4.tsx")) && !sawTheMemo) {
    problems.push(
      `BookLoadModalV4.tsx: \`driverBillPreview\` not found. If it was renamed, rename it here too — ` +
        `a guard that silently matches nothing is worse than no guard.`
    );
  }
  return problems;
}

function readTree() {
  return walk(DIR).map((f) => ({ rel: path.relative(root, f), src: fs.readFileSync(f, "utf8") }));
}

function selftest() {
  const mk = (rel, src) => ({ rel, src });
  const REAL = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";
  const cases = [
    { name: "real tree passes", files: null, expect: 0 },
    {
      name: "the original defect is caught",
      files: [mk(REAL, "const driverBillPreview = useMemo(() => {\n if (miles > 0) return 1;\n return sectionTotal + extraRatesCents;\n}, []);")],
      expectAtLeast: 1,
    },
    {
      name: "the fixed form passes",
      files: [mk(REAL, "const driverBillPreview = useMemo(() => {\n if (miles > 0 && rate > 0) return Math.round(miles * rate * 100);\n return null;\n}, []);")],
      expect: 0,
    },
    {
      name: "customer total in a NON-driver binding is ignored",
      files: [mk("apps/frontend/src/x/a.tsx", "const customerInvoiceTotal = sectionTotal + extraRatesCents;")],
      expect: 0,
    },
    {
      name: "the memo losing its null branch is caught",
      files: [mk(REAL, "const driverBillPreview = useMemo(() => {\n return Math.round(miles * rate * 100);\n}, []);")],
      expectAtLeast: 1,
    },
    {
      name: "a renamed/removed memo is caught, not silently passed",
      files: [mk(REAL, "const somethingElse = 1;")],
      expectAtLeast: 1,
    },
    {
      name: "another surface deriving driver pay from the customer rate is caught",
      files: [mk("apps/frontend/src/y/b.tsx", "const driverPayCents = useMemo(() => rate_total_cents, []);")],
      expectAtLeast: 1,
    },
    {
      name: "commented-out fallback does not count",
      files: [mk("apps/frontend/src/y/c.tsx", "const driverPayCents = 0; // sectionTotal + extraRatesCents")],
      expect: 0,
    },
    {
      name: "misleading no-bill copy is caught",
      files: [
        mk(
          REAL,
          'const driverBillPreview = useMemo(() => { return null; }, []); <span data-testid="book-load-driver-bill-not-priceable">Not priceable — no driver bill will be created</span>'
        ),
      ],
      expectAtLeast: 1,
    },
    {
      name: "honest rate-card and skip disclosure passes",
      files: [
        mk(
          REAL,
          'const driverBillPreview = useMemo(() => { return null; }, []); <span data-testid="book-load-driver-bill-not-priceable">Per-load preview unavailable — active driver rate card checked on submit; otherwise a skipped-no-rate event is recorded</span>'
        ),
      ],
      expect: 0,
    },
  ];
  let pass = 0;
  for (const c of cases) {
    const problems = collectProblems(c.files ?? readTree());
    const ok = c.expect === 0 ? problems.length === 0 : problems.length >= (c.expectAtLeast ?? 1);
    if (ok) pass += 1;
    else console.error(`  selftest FAIL: ${c.name} -> ${JSON.stringify(problems)}`);
  }
  console.log(`${LABEL} selftest ${pass}/${cases.length}`);
  return pass === cases.length ? 0 : 1;
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  if (!fs.existsSync(DIR)) {
    console.error(`${LABEL}: FAIL — ${DIR} not found`);
    return 1;
  }
  const problems = collectProblems(readTree());
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log(`${LABEL}: ok`);
  return 0;
}

process.exit(main());
