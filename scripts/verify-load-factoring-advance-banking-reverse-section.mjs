#!/usr/bin/env node
/** @matrix-built {"modules":["factoring"],"cols":["reverse_link"],"leaves":["accounting.list","banking.entry"],"task":"FACT-F5842-ACCOUNTING-BANKING-REVERSE-EXACT-LEAVES"} */
/**
 * GUARD: a load can find its own factoring advance batch, both from Accounting → Factoring
 * (factoring:accounting.list) and from Banking → Factoring (Faro) (factoring:banking.entry) —
 * LINK-F5171 reverse_link sweep, last 2 of the original 10 factoring gaps.
 *
 * accounting.invoices.factoring_advance_id + accounting.invoices.source_load_id are real FKs that
 * already link a load's invoice to its advance batch; neither list endpoint, nor the load-drawer
 * FactoringTab, ever queried through them.
 *
 * Fix contract this guard pins:
 *   1. factoring-advances.routes.ts's list query schema accepts optional load_id, filtered
 *      server-side via an EXISTS join on accounting.invoices (factoring_advance_id + source_load_id).
 *   2. factoring-virtual.routes.ts's timeline query schema accepts optional load_id, same EXISTS
 *      join pattern.
 *   3. apps/frontend/src/api/accounting.ts's listFactoringAdvances forwards load_id.
 *   4. apps/frontend/src/api/banking.ts's getFactoringVirtualTimeline accepts and forwards loadId.
 *   5. FactoringListPage.tsx reads ?load_id= from the URL and forwards it, AND exposes a visible
 *      Load EntityPicker that writes ?load_id= (LST-F5203 — seed-only was not enough).
 *   6. BankingHome.tsx reads ?load_id= from the URL and forwards it to the Faro timeline query, AND
 *      exposes a visible Load EntityPicker that writes ?load_id=.
 *   7. FactoringTab.tsx (load drawer) links directly to the load's own advance batch
 *      (kind="factoring_advance") and to the Banking (Faro) tab filtered to this load.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ACCT_ROUTES = "apps/backend/src/accounting/factoring-advances.routes.ts";
const BANK_ROUTES = "apps/backend/src/banking/factoring-virtual.routes.ts";
const ACCT_API = "apps/frontend/src/api/accounting.ts";
const BANK_API = "apps/frontend/src/api/banking.ts";
const LIST_PAGE = "apps/frontend/src/pages/accounting/FactoringListPage.tsx";
const BANKING_HOME = "apps/frontend/src/pages/banking/BankingHome.tsx";
const FACTORING_TAB = "apps/frontend/src/components/dispatch/tabs/FactoringTab.tsx";
const SELF = "scripts/verify-load-factoring-advance-banking-reverse-section.mjs";
const REQUIRED = "docs/specs/scoreboard/modules/factoring.required.json";
const FILES = [ACCT_ROUTES, BANK_ROUTES, ACCT_API, BANK_API, LIST_PAGE, BANKING_HOME, FACTORING_TAB, SELF, REQUIRED];
const LABEL = "verify-load-factoring-advance-banking-reverse-section";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertLoadFactoringReverse(sources) {
  const src = {};
  for (const rel of FILES) src[rel] = sources?.[rel] ?? read(rel);
  const problems = [];
  const acctRoutes = src[ACCT_ROUTES];
  const bankRoutes = src[BANK_ROUTES];
  const acctApi = src[ACCT_API];
  const bankApi = src[BANK_API];
  const listPage = src[LIST_PAGE];
  const bankingHome = src[BANKING_HOME];
  const factoringTab = src[FACTORING_TAB];
  const self = src[SELF];
  const required = src[REQUIRED];

  if (!/^\/\*\* @matrix-built \{"modules":\["factoring"\],"cols":\["reverse_link"\],"leaves":\["accounting\.list","banking\.entry"\],"task":"FACT-F5842-ACCOUNTING-BANKING-REVERSE-EXACT-LEAVES"\} \*\/$/m.test(self)) {
    problems.push(`${SELF}: Built annotation must own the exact accounting-list and banking-entry reverse leaves`);
  }
  let requiredLeaves = [];
  try {
    requiredLeaves = JSON.parse(required).leaves ?? [];
  } catch {
    problems.push(`${REQUIRED}: must remain valid JSON`);
  }
  for (const id of ["accounting.list", "banking.entry"]) {
    if (!requiredLeaves.find((leaf) => leaf.id === id)?.required?.includes("reverse_link")) {
      problems.push(`${REQUIRED}: ${id} must remain a Required reverse_link leaf`);
    }
  }

  if (!/load_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(acctRoutes)) {
    problems.push(`${ACCT_ROUTES}: listQuerySchema must accept optional load_id`);
  }
  if (!/i\.factoring_advance_id = fa\.id[\s\S]{0,120}i\.source_load_id = \$/.test(acctRoutes)) {
    problems.push(`${ACCT_ROUTES}: must filter by load_id server-side via an invoice EXISTS join`);
  }
  if (!/timelineQuerySchema = companyQuerySchema\.extend\(\{\s*load_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(bankRoutes)) {
    problems.push(`${BANK_ROUTES}: timelineQuerySchema must accept optional load_id`);
  }
  if (!/i\.factoring_advance_id = fa\.id[\s\S]{0,120}i\.source_load_id = \$/.test(bankRoutes)) {
    problems.push(`${BANK_ROUTES}: timeline must filter by load_id server-side via an invoice EXISTS join`);
  }
  if (!/load_id\?:\s*string;/.test(acctApi)) {
    problems.push(`${ACCT_API}: listFactoringAdvances filters type must accept load_id`);
  }
  if (!/filters\.load_id.*query\.set\("load_id"/.test(acctApi)) {
    problems.push(`${ACCT_API}: listFactoringAdvances must forward load_id as a query param`);
  }
  if (!/export function getFactoringVirtualTimeline\(companyId: string, loadId\?: string\)/.test(bankApi)) {
    problems.push(`${BANK_API}: getFactoringVirtualTimeline must accept an optional loadId param`);
  }
  if (!/load_id=\$\{encodeURIComponent\(loadId\)\}/.test(bankApi)) {
    problems.push(`${BANK_API}: getFactoringVirtualTimeline must forward loadId as a load_id query param`);
  }
  if (!/searchParams\.get\("load_id"\)/.test(listPage)) {
    problems.push(`${LIST_PAGE}: must read load_id from URL search params`);
  }
  if (!/load_id:\s*deepLinkLoadId\s*\?\?\s*undefined/.test(listPage)) {
    problems.push(`${LIST_PAGE}: must forward deepLinkLoadId to listFactoringAdvances`);
  }
  if (!/setSearchParams/.test(listPage) || !/params\.set\("load_id"/.test(listPage)) {
    problems.push(`${LIST_PAGE}: must write load_id via setSearchParams (visible reverse filter)`);
  }
  if (!/kind="load"/.test(listPage) || !/dataTestId="factoring-filter-load"/.test(listPage) || !/allowCreate=\{false\}/.test(listPage)) {
    problems.push(`${LIST_PAGE}: must render Load EntityPicker allowCreate={false} dataTestId=factoring-filter-load`);
  }
  if (!/deepLinkLoadId\s*=\s*searchParams\.get\("load_id"\)/.test(bankingHome)) {
    problems.push(`${BANKING_HOME}: must read load_id from URL search params`);
  }
  if (!/getFactoringVirtualTimeline\(companyId,\s*deepLinkLoadId\s*\?\?\s*undefined\)/.test(bankingHome)) {
    problems.push(`${BANKING_HOME}: must forward deepLinkLoadId to getFactoringVirtualTimeline`);
  }
  if (!/setSearchParams/.test(bankingHome) || !/params\.set\("load_id"/.test(bankingHome)) {
    problems.push(`${BANKING_HOME}: must write load_id via setSearchParams (visible reverse filter)`);
  }
  if (
    !/kind="load"/.test(bankingHome) ||
    !/dataTestId="banking-factoring-filter-load"/.test(bankingHome) ||
    !/allowCreate=\{false\}/.test(bankingHome)
  ) {
    problems.push(`${BANKING_HOME}: must render Load EntityPicker allowCreate={false} dataTestId=banking-factoring-filter-load`);
  }
  if (!/kind="factoring_advance"[\s\S]{0,120}id=\{linkedInvoice\.factoring_advance_id\}/.test(factoringTab)) {
    problems.push(`${FACTORING_TAB}: must EntityLink kind=factoring_advance to the load's own advance batch`);
  }
  if (!/\/banking\/factoring\?load_id=\$\{encodeURIComponent\(loadId\)\}/.test(factoringTab)) {
    problems.push(`${FACTORING_TAB}: must link to /banking/factoring filtered to this load`);
  }
  return problems;
}

function selftest() {
  const good = {
    [ACCT_ROUTES]: `
      const listQuerySchema = companyQuerySchema.extend({
        load_id: z.string().uuid().optional(),
      });
      if (q.load_id) {
        values.push(q.load_id);
        where.push(
          \`EXISTS (
             SELECT 1 FROM accounting.invoices i
             WHERE i.factoring_advance_id = fa.id
               AND i.operating_company_id = fa.operating_company_id
               AND i.source_load_id = $\${values.length}::uuid
           )\`
        );
      }
    `,
    [BANK_ROUTES]: `
      const timelineQuerySchema = companyQuerySchema.extend({
        load_id: z.string().uuid().optional(),
      });
      if (loadId) {
        values.push(loadId);
        loadFilter = \`
          AND EXISTS (
            SELECT 1 FROM accounting.invoices i
            WHERE i.factoring_advance_id = fa.id
              AND i.operating_company_id = fa.operating_company_id
              AND i.source_load_id = $\${values.length}::uuid
          )\`;
      }
    `,
    [ACCT_API]: `
      export function listFactoringAdvances(
        operatingCompanyId: string,
        filters: {
          load_id?: string;
        } = {}
      ) {
        if (filters.load_id) query.set("load_id", filters.load_id);
      }
    `,
    [BANK_API]: `
      export function getFactoringVirtualTimeline(companyId: string, loadId?: string) {
        const qs = loadId ? \`\${q(companyId)}&load_id=\${encodeURIComponent(loadId)}\` : q(companyId);
      }
    `,
    [LIST_PAGE]: `
      const [searchParams, setSearchParams] = useSearchParams();
      const deepLinkLoadId = searchParams.get("load_id");
      function patchLoadFilter(next: string) {
        setSearchParams((prev) => {
          const params = new URLSearchParams(prev);
          if (next) params.set("load_id", next);
          else params.delete("load_id");
          return params;
        }, { replace: true });
      }
      listFactoringAdvances(selectedCompanyId!, {
        load_id: deepLinkLoadId ?? undefined,
      })
      <EntityPicker kind="load" allowCreate={false} dataTestId="factoring-filter-load" onChange={(next) => patchLoadFilter(next ?? "")} />
    `,
    [BANKING_HOME]: `
      const [searchParams, setSearchParams] = useSearchParams();
      const deepLinkLoadId = searchParams.get("load_id");
      function patchLoadFilter(next: string) {
        setSearchParams((prev) => {
          const params = new URLSearchParams(prev);
          if (next) params.set("load_id", next);
          else params.delete("load_id");
          return params;
        }, { replace: true });
      }
      const factoringTimelineQuery = useQuery({
        queryFn: () => getFactoringVirtualTimeline(companyId, deepLinkLoadId ?? undefined),
      });
      <EntityPicker kind="load" allowCreate={false} dataTestId="banking-factoring-filter-load" onChange={(next) => patchLoadFilter(next ?? "")} />
    `,
    [FACTORING_TAB]: `
      <EntityLink
        kind="factoring_advance"
        id={linkedInvoice.factoring_advance_id}
        label="View Advance Batch →"
      />
      <Link to={\`/banking/factoring?load_id=\${encodeURIComponent(loadId)}\`}>
        View in Banking (Faro) →
      </Link>
    `,
    [SELF]: `/** @matrix-built {"modules":["factoring"],"cols":["reverse_link"],"leaves":["accounting.list","banking.entry"],"task":"FACT-F5842-ACCOUNTING-BANKING-REVERSE-EXACT-LEAVES"} */`,
    [REQUIRED]: `{"leaves":[{"id":"accounting.list","required":["reverse_link"]},{"id":"banking.entry","required":["reverse_link"]}]}`,
  };
  const goodProblems = assertLoadFactoringReverse(good);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    { ...good, [ACCT_ROUTES]: good[ACCT_ROUTES].replace("load_id: z.string().uuid().optional(),\n      });", "});") },
    { ...good, [ACCT_ROUTES]: good[ACCT_ROUTES].replace("i.source_load_id = $${values.length}::uuid", "true") },
    { ...good, [BANK_ROUTES]: good[BANK_ROUTES].replace("load_id: z.string().uuid().optional(),\n      });", "});") },
    { ...good, [BANK_ROUTES]: good[BANK_ROUTES].replace("i.source_load_id = $${values.length}::uuid", "true") },
    { ...good, [ACCT_API]: good[ACCT_API].replace("load_id?: string;\n        } = {}", "} = {}") },
    { ...good, [ACCT_API]: good[ACCT_API].replace('if (filters.load_id) query.set("load_id", filters.load_id);', "") },
    { ...good, [BANK_API]: good[BANK_API].replace("loadId?: string", "") },
    { ...good, [BANK_API]: good[BANK_API].replace("load_id=${encodeURIComponent(loadId)}", "") },
    { ...good, [LIST_PAGE]: good[LIST_PAGE].replace('searchParams.get("load_id")', '""') },
    { ...good, [LIST_PAGE]: good[LIST_PAGE].replace("load_id: deepLinkLoadId ?? undefined,", "") },
    { ...good, [LIST_PAGE]: good[LIST_PAGE].replace(/setSearchParams/g, "setUrlParams") },
    { ...good, [LIST_PAGE]: good[LIST_PAGE].replace('dataTestId="factoring-filter-load"', "") },
    { ...good, [BANKING_HOME]: good[BANKING_HOME].replace('deepLinkLoadId = searchParams.get("load_id")', 'deepLinkLoadId = null') },
    {
      ...good,
      [BANKING_HOME]: good[BANKING_HOME].replace(
        "getFactoringVirtualTimeline(companyId, deepLinkLoadId ?? undefined)",
        "getFactoringVirtualTimeline(companyId)"
      ),
    },
    { ...good, [BANKING_HOME]: good[BANKING_HOME].replace(/setSearchParams/g, "setUrlParams") },
    { ...good, [BANKING_HOME]: good[BANKING_HOME].replace('dataTestId="banking-factoring-filter-load"', "") },
    { ...good, [FACTORING_TAB]: good[FACTORING_TAB].replace('kind="factoring_advance"', 'kind="factoring_batch"') },
    {
      ...good,
      [FACTORING_TAB]: good[FACTORING_TAB].replace(
        "id={linkedInvoice.factoring_advance_id}",
        "id={linkedInvoice.id}"
      ),
    },
    { ...good, [FACTORING_TAB]: good[FACTORING_TAB].replace("/banking/factoring?load_id=", "/banking/factoring") },
    { ...good, [SELF]: good[SELF].replace('"leaves":["accounting.list","banking.entry"]', '"leafRe":".*"') },
    { ...good, [REQUIRED]: good[REQUIRED].replace('{"id":"accounting.list","required":["reverse_link"]}', '{"id":"accounting.list","required":["load"]}') },
    { ...good, [REQUIRED]: good[REQUIRED].replace('{"id":"banking.entry","required":["reverse_link"]}', '{"id":"banking.entry","required":["load"]}') },
  ];
  for (const [i, mutated] of mutations.entries()) {
    if (assertLoadFactoringReverse(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation ${i} escaped detection`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations all detected`);
  process.exit(0);
}

if (SELFTEST) selftest();

const failures = assertLoadFactoringReverse();
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
