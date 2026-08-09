#!/usr/bin/env node
/**
 * Static guard: Chart of Accounts list must deep-link to the live Account Register route,
 * and the AccountRegisterPage must read the deep-link parameter.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

const listPage = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/lists/accounting/ChartOfAccountsListPage.tsx"), "utf8");
const registerPage = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx"), "utf8");
const routes = fs.readFileSync(path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"), "utf8");

if (!/accounting\/chart-of-accounts\/register\/\$\{/.test(listPage) && !/account-register\?accountId=/.test(listPage)) {
  errors.push("ChartOfAccountsListPage has no register deep-link");
}
if (!/accounting\/chart-of-accounts\/register\/\s*:accountId/.test(routes) && !/\/accounting\/account-register/.test(routes)) {
  errors.push("Route manifest is missing the account register routes");
}
if (!/useParams/.test(registerPage) || !/accountId/.test(registerPage)) {
  errors.push("AccountRegisterPage does not consume the accountId route param");
}
if (!/getAccountRegister/.test(registerPage)) {
  errors.push("AccountRegisterPage does not call getAccountRegister");
}

if (errors.length > 0) {
  for (const e of errors) console.error("FAIL:", e);
  process.exit(1);
}
console.log("PASS: Chart of Accounts card/list deep-links to a live Account Register route");
process.exit(0);
