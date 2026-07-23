#!/usr/bin/env node
/**
 * CoA Roles account picker (WO 2026-07-23 item 1) — empty "Select account…" root cause.
 *
 * Live defect: listCoaAccountsForJe() called /catalogs/accounts without operating_company_id
 * and CoaRolesPage did not gate/refetch on the switcher entity. Under af1 FORCE RLS, a missed
 * or wrong entity scope returns [] — indistinguishable from an empty chart — so the owner cannot
 * designate ANY role in the UI.
 *
 * Guard (static + planted selftest):
 *  1) Backend list schema accepts postable_only and filters is_postable = true
 *  2) FE listCoaAccountsForJe requires operating_company_id + postable_only=true on the query
 *  3) CoaRolesPage passes companyId, enables on company, queryKey includes companyId
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const FILES = {
  routes: "apps/backend/src/catalogs/accounts.routes.ts",
  api: "apps/frontend/src/api/accounting.ts",
  page: "apps/frontend/src/pages/accounting/CoaRolesPage.tsx",
};

export function run(root = ROOT) {
  const failures = [];
  const routes = fs.readFileSync(path.join(root, FILES.routes), "utf8");
  const api = fs.readFileSync(path.join(root, FILES.api), "utf8");
  const page = fs.readFileSync(path.join(root, FILES.page), "utf8");

  if (!/postable_only/.test(routes)) {
    failures.push(`${FILES.routes}: listQuerySchema must accept postable_only`);
  }
  if (!/if \(postable_only\) filters\.push\("is_postable = true"\)/.test(routes)) {
    failures.push(`${FILES.routes}: GET list must filter is_postable = true when postable_only`);
  }

  const fnMatch = api.match(/export async function listCoaAccountsForJe\([\s\S]*?\n\}/);
  const fn = fnMatch?.[0] ?? "";
  if (!/operatingCompanyId:\s*string/.test(fn)) {
    failures.push(`${FILES.api}: listCoaAccountsForJe must require operatingCompanyId`);
  }
  if (!/operating_company_id/.test(fn)) {
    failures.push(`${FILES.api}: listCoaAccountsForJe must send operating_company_id on the query`);
  }
  if (!/postable_only/.test(fn)) {
    failures.push(`${FILES.api}: listCoaAccountsForJe must send postable_only for posting pickers`);
  }
  // Bug shape: bare call with no company param (the live empty picker).
  if (/export async function listCoaAccountsForJe\(\)/.test(api)) {
    failures.push(`${FILES.api}: listCoaAccountsForJe() with no args is the empty-picker bug shape`);
  }

  if (!/listCoaAccountsForJe\(companyId/.test(page)) {
    failures.push(`${FILES.page}: must call listCoaAccountsForJe(companyId, …)`);
  }
  if (!/queryKey:\s*\[["']coa-roles["'],\s*["']accounts["'],\s*companyId\]/.test(page)) {
    failures.push(`${FILES.page}: accounts queryKey must include companyId`);
  }
  if (!/enabled:\s*Boolean\(companyId\)/.test(page)) {
    failures.push(`${FILES.page}: accounts query must be enabled only when companyId is set`);
  }

  return failures;
}

function selftest() {
  const tmp = fs.mkdtempSync("/tmp/verify-coa-roles-picker-");
  for (const rel of Object.values(FILES)) {
    fs.mkdirSync(path.join(tmp, path.dirname(rel)), { recursive: true });
  }

  fs.writeFileSync(
    path.join(tmp, FILES.routes),
    `
const listQuerySchema = z.object({ limit: z.number() });
if (status === "active") filters.push("deactivated_at IS NULL");
`
  );
  fs.writeFileSync(
    path.join(tmp, FILES.api),
    `
export async function listCoaAccountsForJe() {
  const res = await apiRequest("/api/v1/catalogs/accounts?status=active&limit=200&offset=0");
  return res;
}
`
  );
  fs.writeFileSync(
    path.join(tmp, FILES.page),
    `
const accountsQuery = useQuery({
  queryKey: ["coa-roles", "accounts"],
  queryFn: () => listCoaAccountsForJe(),
  staleTime: 60_000,
});
`
  );
  if (!run(tmp).length) throw new Error("selftest: bug shape must FAIL");

  fs.writeFileSync(
    path.join(tmp, FILES.routes),
    `
postable_only: z.boolean().optional(),
if (postable_only) filters.push("is_postable = true");
`
  );
  fs.writeFileSync(
    path.join(tmp, FILES.api),
    `
export async function listCoaAccountsForJe(operatingCompanyId: string, opts?: { postableOnly?: boolean }) {
  const qs = new URLSearchParams({ operating_company_id: operatingCompanyId, postable_only: "true" });
  return apiRequest("/api/v1/catalogs/accounts?" + qs);
}
`
  );
  fs.writeFileSync(
    path.join(tmp, FILES.page),
    `
const accountsQuery = useQuery({
  queryKey: ["coa-roles", "accounts", companyId],
  queryFn: () => listCoaAccountsForJe(companyId, { postableOnly: true }),
  enabled: Boolean(companyId),
});
`
  );
  const good = run(tmp);
  if (good.length) throw new Error("selftest: fixed shape must PASS: " + good.join("; "));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-coa-roles-accounts-picker-entity-scoped --selftest OK");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else {
    const f = run();
    if (f.length) {
      console.error(f.join("\n"));
      process.exit(1);
    }
    console.log("verify-coa-roles-accounts-picker-entity-scoped — OK");
  }
}
