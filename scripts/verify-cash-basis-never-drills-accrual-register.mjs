#!/usr/bin/env node
/**
 * ACCT-F410-A — a CASH-basis figure must never drill into the account register.
 *
 * WHY THIS IS A GUARD AND NOT A CODE COMMENT
 *   The account register is ACCRUAL-ONLY, in the page and in the backend service. MEASURED
 *   2026-10-05: zero occurrences of `basis` in apps/backend/src/accounting/account-register.routes.ts
 *   and account-register.service.ts, and AccountRegisterPage reads only accountId / from_date /
 *   to_date. The cash-basis reports are computed through accounting/cash-basis/engine.ts
 *   applyCashBasisSuppression, which ZEROES AR/AP control rows (@decision Q3) and zeroes any
 *   invoice_revenue / bill_expense / driver_settlement not settled by the as-of date
 *   (@decision Q5, VQ5). A cash-basis figure and the accrual register therefore DO NOT TIE — by
 *   construction and by locked decision, not by accident.
 *
 *   Four pages had each written their own `registerHref(accountId, from, to, basis)` that put
 *   `basis` in the query string, which the register silently dropped: TrialBalancePage,
 *   ProfitLossPage, BalanceSheetPage and finance/FinancialStatementsPage. Under Cash basis every
 *   account link on those pages navigated to a register total that disagreed with the figure
 *   clicked. That is the specific class of defect this guard freezes shut: a fifth page writing a
 *   fifth copy of the same helper is a one-line mistake, and nothing would have caught it.
 *
 * THE LAW IT ENFORCES — one rule, one owner:
 *   resolveAmountRoute in components/shared/AmountLink.tsx is the ONLY thing allowed to build a
 *   register route, and it returns null when the filter's basis is "cash". No page may hand-build
 *   a register URL, with or without a basis param.
 *
 * ESCAPE HATCH, deliberately none. When the register learns the basis (ACCT-F410: accept it, map
 * each posting to a CashBasisEntry, run the same applyCashBasisSuppression the reports run, so the
 * register ties to the report by construction) the correct change is to delete the null branch in
 * resolveAmountRoute and this guard's RULE 1 together — not to add a bypass list here.
 */
import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-cash-basis-never-drills-accrual-register";
const PRIMITIVE = "apps/frontend/src/components/shared/AmountLink.tsx";
const SRC = "apps/frontend/src";
const REGISTER_PATH = "/accounting/chart-of-accounts/register/";

/** Strip // and /* *​/ comments so prose about the defect never counts as the defect. */
export function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/** RULE 1 — the primitive refuses the cash case. */
export function checkPrimitive(src) {
  const problems = [];
  const code = stripComments(src);
  if (!/filter\.basis\s*===\s*"cash"/.test(code) || !/return null/.test(code)) {
    problems.push(
      `${PRIMITIVE}: resolveAmountRoute must return null when filter.basis === "cash" — the ` +
        `register is accrual-only, so a cash-basis figure has no destination that reproduces it`
    );
  }
  if (!/basis\?:\s*"accrual"\s*\|\s*"cash"\s*\|\s*null/.test(code)) {
    problems.push(
      `${PRIMITIVE}: the register AmountFilter must carry basis?: "accrual" | "cash" | null, so a ` +
        `caller cannot omit it by accident and get a silent accrual drill`
    );
  }
  return problems;
}

/**
 * A file is BASIS-BEARING when it computes or displays figures on an accounting basis — it names
 * AccountingBasis, mounts a BasisSelector, or reads a `.basis`. Only those files can drop a basis,
 * so only those files are policed by RULE 2.
 *
 * MEASURED 2026-10-05, and this is why the rule is scoped this way rather than blanket: a blanket
 * "no hand-built register route" flagged 10 files and NINE were correct code —
 * routes/manifest.tsx (where the route is declared), EntityLink.tsx (the single-entity drill
 * primitive), ChartOfAccountsListPage, BankingHome, PostingGrid, and the Bill/Expense/Invoice
 * detail pages. Those are "open this account's register" navigation with no basis in play; there
 * is no basis for them to drop. All nine score 0 on this test; the one real defect,
 * ManagementReportPackagePage, scored 13. A guard that cries wolf is worse than no guard, and a
 * blanket rule here would have made nine seats add nine bypasses.
 */
export function isBasisBearing(src) {
  const code = stripComments(src);
  return /\bAccountingBasis\b/.test(code) || /\bBasisSelector\b/.test(code) || /\.basis\b/.test(code);
}

/** RULE 2 — no BASIS-BEARING file hand-builds a register route. The primitive owns it. */
export function checkNoHandBuiltRegisterRoutes(files) {
  const problems = [];
  for (const { file, src } of files) {
    if (file.replace(/\\/g, "/").endsWith("components/shared/AmountLink.tsx")) continue;
    const code = stripComments(src);
    if (!code.includes(REGISTER_PATH)) continue;
    if (!isBasisBearing(src)) continue;
    problems.push(
      `${file}: computes figures on an accounting basis AND builds a register route by hand ` +
        `("${REGISTER_PATH}"). Only resolveAmountRoute in ` +
        `${PRIMITIVE} may build it — it is what applies THE BASIS RULE. Use ` +
        `<AmountLink filter={{ target: "register", accountId, from, to, basis }}>.`
    );
  }
  return problems;
}

/** RULE 3 — no page re-invents the dropped-basis helper under any name. */
export function checkNoRegisterHrefHelper(files) {
  const problems = [];
  for (const { file, src } of files) {
    if (!isBasisBearing(src)) continue;
    const code = stripComments(src);
    const m = code.match(/function\s+(\w*[Rr]egister\w*Href|\w*[Hh]ref\w*[Rr]egister\w*)\s*\(/);
    if (m) {
      problems.push(
        `${file}: defines ${m[1]}() — a local register-URL builder in a basis-bearing file. SIX of ` +
          `these existed across five files and every one silently dropped basis. Delete it and use ` +
          `AmountLink's filter.`
      );
    }
  }
  return problems;
}

/** RULE 4 — the stated premise stays true: the register really is accrual-only. */
export function checkRegisterIsStillAccrualOnly(backendSources) {
  const problems = [];
  const present = backendSources.filter((b) => b.exists);
  if (present.length === 0) {
    return { problems, unverifiableHereOk: "backend register sources not present in this tree" };
  }
  const basisAware = present.filter((b) => /\bbasis\b/.test(stripComments(b.src)));
  if (basisAware.length > 0) {
    problems.push(
      `${basisAware.map((b) => b.file).join(", ")}: now mentions basis. If the register has learned ` +
        `the basis (ACCT-F410), this guard's RULE 1 and the null branch in resolveAmountRoute must ` +
        `be removed TOGETHER, in that same commit — a cash figure may then drill. If it has not, ` +
        `the mention is a half-built basis path and the register is lying about its own numbers.`
    );
  }
  return { problems };
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(e.name) && !/\.test\.(tsx|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

export function findProblems({ primitiveSrc, files, backendSources }) {
  const problems = [
    ...checkPrimitive(primitiveSrc),
    ...checkNoHandBuiltRegisterRoutes(files),
    ...checkNoRegisterHrefHelper(files),
  ];
  const accrual = checkRegisterIsStillAccrualOnly(backendSources);
  problems.push(...accrual.problems);
  return { problems, unverifiableHereOk: accrual.unverifiableHereOk };
}

/** Fixtures only. This selftest never reads the live tree — a guard's unit test must not be
 *  coupled to other seats' commits (LST-F407). */
function selftest() {
  const goodPrimitive = `
    export type AmountFilter = { target: "register"; accountId: string; basis?: "accrual" | "cash" | null };
    export function resolveAmountRoute(filter) {
      if (filter.basis === "cash") return null;
      return "/accounting/chart-of-accounts/register/" + filter.accountId;
    }`;
  const bs = [{ file: "account-register.service.ts", exists: true, src: "const rows = await q(SELECT 1);" }];
  const cases = [
    { name: "clean tree", primitiveSrc: goodPrimitive, files: [], backendSources: bs, expectFail: false },
    {
      name: "primitive lost the cash branch",
      primitiveSrc: goodPrimitive.replace('if (filter.basis === "cash") return null;', ""),
      files: [], backendSources: bs, expectFail: true,
    },
    {
      name: "primitive lost basis from the filter type",
      primitiveSrc: goodPrimitive.replace(' basis?: "accrual" | "cash" | null', ""),
      files: [], backendSources: bs, expectFail: true,
    },
    {
      name: "page hand-builds a register route",
      primitiveSrc: goodPrimitive, backendSources: bs, expectFail: true,
      files: [{ file: "pages/reports/NewPage.tsx", src: 'const b: AccountingBasis = x; const h = "/accounting/chart-of-accounts/register/" + id;' }],
    },
    {
      name: "prose about the route is not the route",
      primitiveSrc: goodPrimitive, backendSources: bs, expectFail: false,
      files: [{ file: "pages/reports/NewPage.tsx", src: '// never build /accounting/chart-of-accounts/register/ by hand' }],
    },
    {
      name: "page re-invents registerHref",
      primitiveSrc: goodPrimitive, backendSources: bs, expectFail: true,
      files: [{ file: "pages/reports/NewPage.tsx", src: "const sel = <BasisSelector />; function registerHref(id, a, b, basis) { return x; }" }],
    },
    {
      name: "a page with NO basis may open a register directly",
      primitiveSrc: goodPrimitive, backendSources: bs, expectFail: false,
      files: [{ file: "pages/lists/ChartOfAccountsListPage.tsx", src: 'navigate("/accounting/chart-of-accounts/register/" + id);' }],
    },
    {
      name: "route declaration is not a drill",
      primitiveSrc: goodPrimitive, backendSources: bs, expectFail: false,
      files: [{ file: "routes/manifest.tsx", src: 'path: "/accounting/chart-of-accounts/register/:accountId",' }],
    },
    {
      name: "backend grew a basis path while the null branch still stands",
      primitiveSrc: goodPrimitive, files: [], expectFail: true,
      backendSources: [{ file: "account-register.service.ts", exists: true, src: "const basis = input.basis;" }],
    },
    {
      name: "backend sources absent is unverifiable, not a pass",
      primitiveSrc: goodPrimitive, files: [], expectFail: false,
      backendSources: [{ file: "account-register.service.ts", exists: false, src: "" }],
      expectUnverifiable: true,
    },
  ];
  let pass = 0;
  for (const c of cases) {
    const { problems, unverifiableHereOk } = findProblems(c);
    const failed = problems.length > 0;
    const ok = failed === c.expectFail && (!c.expectUnverifiable || Boolean(unverifiableHereOk));
    console.log(`${ok ? "ok   " : "FAIL "} ${c.name}`);
    if (ok) pass += 1;
    else if (failed) console.log(`        ${problems.join("\n        ")}`);
  }
  console.log(`\n${LABEL} --selftest: ${pass}/${cases.length} ${pass === cases.length ? "PASS" : "FAIL"}`);
  process.exit(pass === cases.length ? 0 : 1);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const primitiveSrc = fs.existsSync(PRIMITIVE) ? fs.readFileSync(PRIMITIVE, "utf8") : "";
  if (!primitiveSrc) {
    console.error(`${LABEL} FAIL — ${PRIMITIVE} is missing; the register-route owner must exist.`);
    process.exit(1);
  }
  const files = walk(SRC).map((file) => ({ file, src: fs.readFileSync(file, "utf8") }));
  const backendSources = [
    "apps/backend/src/accounting/account-register.routes.ts",
    "apps/backend/src/accounting/account-register.service.ts",
  ].map((file) => ({
    file,
    exists: fs.existsSync(file),
    src: fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "",
  }));
  const { problems, unverifiableHereOk } = findProblems({ primitiveSrc, files, backendSources });
  if (problems.length > 0) {
    console.error(`${LABEL} FAIL — ${problems.length} defect(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  const note = unverifiableHereOk ? ` (${unverifiableHereOk})` : "";
  console.log(
    `${LABEL} OK — resolveAmountRoute owns the register route and refuses basis "cash"; ` +
      `${files.length} frontend file(s) hand-build none${note}.`
  );
}
