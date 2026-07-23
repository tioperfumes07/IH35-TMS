#!/usr/bin/env node
/** Banking Full Audit FAIL 29 — Match drawer nested +Create vendor/CoA (§4). */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const drawer = fs.readFileSync(
    `${root}/apps/frontend/src/pages/banking/components/MatchDrawer.tsx`,
    "utf8"
  );

  if (!drawer.includes('data-testid="match-drawer-categorize-create"')) {
    failures.push("MatchDrawer must expose match-drawer-categorize-create section");
  }
  if (!drawer.includes('data-testid="match-drawer-picker-vendor"') || !drawer.includes('createKind="vendor"')) {
    failures.push("MatchDrawer must ReferenceSelect createKind=vendor for payee");
  }
  if (!drawer.includes('data-testid="match-drawer-picker-category"') || !drawer.includes('createKind="category"')) {
    failures.push("MatchDrawer must ReferenceSelect createKind=category for CoA");
  }
  if (!drawer.includes("listVendors") || !drawer.includes("operating_company_id")) {
    failures.push("MatchDrawer vendor catalog must be entity-scoped via listVendors(operating_company_id)");
  }
  if (!drawer.includes("getCoaAccounts(operatingCompanyId)")) {
    failures.push("MatchDrawer CoA catalog must call getCoaAccounts(operatingCompanyId)");
  }
  if (!drawer.includes("onOptionCreated") || !drawer.includes("vendorsQuery.refetch") || !drawer.includes("coaQuery.refetch")) {
    failures.push("MatchDrawer +Create must refetch vendor/CoA catalogs onOptionCreated");
  }
  if (!drawer.includes("categorizeBankTransaction(")) {
    failures.push("MatchDrawer categorize path must call categorizeBankTransaction");
  }
  if (!drawer.includes('data-testid="match-drawer-categorize-submit"')) {
    failures.push("MatchDrawer must expose categorize submit control");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-match-drawer-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  mk(
    "apps/frontend/src/pages/banking/components/MatchDrawer.tsx",
    `data-testid="match-drawer-categorize-create"
data-testid="match-drawer-picker-vendor"
createKind="vendor"
data-testid="match-drawer-picker-category"
createKind="category"
listVendors
operating_company_id
getCoaAccounts(operatingCompanyId)
onOptionCreated
vendorsQuery.refetch
coaQuery.refetch
categorizeBankTransaction(
data-testid="match-drawer-categorize-submit"
`
  );
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));
  mk("apps/frontend/src/pages/banking/components/MatchDrawer.tsx", "x\n");
  if (!run(tmp).length) throw new Error("FAIL fail");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-match-drawer-create --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-banking-match-drawer-create — OK");
}
