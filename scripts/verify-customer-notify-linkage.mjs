#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["customer","connectivity","reverse_link","picker_law"],"leaves":["settings.notify"],"task":"CUSTOMER-NOTIFY-LINKAGE-EXACT","vertical":"column-wave"} */
/** @matrix-built {"modules":["customers"],"cols":["customer","connectivity","reverse_link"],"leaves":["detail.profile"],"task":"CUSTOMER-NOTIFY-LINKAGE-EXACT","vertical":"column-wave"} */
import fs from "node:fs";
const LABEL = "verify-customer-notify-linkage";
const files = {
  page: "apps/frontend/src/pages/dispatch/NotifyPreferencesPage.tsx",
  service: "apps/backend/src/dispatch/customer-notify.service.ts",
  routes: "apps/backend/src/dispatch/customer-notify.routes.ts",
  reverse: "apps/frontend/src/components/dispatch/CustomerNotifyReverseSection.tsx",
  customer: "apps/frontend/src/pages/CustomerDetail.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function audit(s) {
  const failures = [];
  if (!/<EntityPicker[\s\S]{0,240}kind=["']customer["']/.test(s.page)) failures.push("canonical customer picker missing");
  if (!/mutationFn:\s*\(input:\s*\{\s*companyId:\s*string;\s*customerId:\s*string;\s*patch:/.test(s.page)) failures.push("customer-scoped mutation input missing");
  if (!/updateCustomerNotifyPreferences\(input\.customerId,\s*\{\s*operating_company_id:\s*input\.companyId,\s*\.\.\.input\.patch\s*\}\)/.test(s.page)) failures.push("customer picker identity does not reach the company-scoped writer payload");
  if (!/import\s*\{\s*EntityLinkOrTombstone\s*\}\s*from\s*["'][^"']*\/EntityLinkOrTombstone["']/.test(s.page)) failures.push("notify log must import canonical label-aware tombstones");
  if (!/kind="load" id=\{entry\.load_id\} name=\{entry\.load_number\} noun="Load"/.test(s.page)) failures.push("notify log load must couple canonical id to human load number");
  if (!/kind="customer"[\s\S]{0,100}id=\{entry\.customer_id\}[\s\S]{0,100}name=\{entry\.customer_name\}[\s\S]{0,60}noun="Customer"/.test(s.page)) failures.push("notify log customer must couple canonical id to human name");
  if (!/customerBelongsToCompany[\s\S]{0,420}FROM mdata\.customers[\s\S]{0,160}operating_company_id = \$1::uuid[\s\S]{0,100}deactivated_at IS NULL/.test(s.service)) failures.push("active tenant customer validation missing");
  if ((s.service.match(/FROM views\.dispatch_load_with_driver_status l/g) ?? []).length < 2) failures.push("ETA context and notification scan must read the canonical latest-prediction view");
  if ((s.service.match(/E_CUSTOMER_NOT_FOUND/g) ?? []).length < 2 || !/customer_not_found/.test(s.routes)) failures.push("read/write missing-customer contract missing");
  if (!/getCustomerNotifyPreferences\(customerId, operatingCompanyId\)/.test(s.reverse) || !/getCustomerNotifyLog\(operatingCompanyId, customerId\)/.test(s.reverse)) failures.push("exact customer reverse reads missing");
  if (!/preferences\.isError[\s\S]{0,240}preferences\.refetch\(\)/.test(s.reverse)) failures.push("preference error retry missing");
  if (!/log\.isError[\s\S]{0,240}log\.refetch\(\)/.test(s.reverse)) failures.push("history error retry missing");
  if (!/!preferences\.isError && !log\.isError/.test(s.reverse) || !/No delivery confirmations logged yet/.test(s.reverse)) failures.push("honest reverse success/empty states missing");
  if (!(/kind="customer_notify_preferences"/.test(s.reverse) || /dispatch\/notify-preferences\?customer_id=/.test(s.reverse)) || !/useSearchParams\(\)\[0\]\.get\("customer_id"\)/.test(s.page)) {
    failures.push("filtered canonical drill missing");
  }
  if (!/CustomerNotifyReverseSection[\s\S]{0,140}customerId=\{id\}/.test(s.customer)) failures.push("customer profile reverse mount missing");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "page", /<EntityPicker[\s\S]{0,200}kind=["']customer["']/, '<EntityPicker kind="vendor"'],
    ["mutation-input", "page", /customerId:\s*string;\s*patch:/, "customerKey: string; patch:"],
    ["payload", "page", /updateCustomerNotifyPreferences\(input\.customerId/, "updateCustomerNotifyPreferences(input.companyId"],
    ["load-label", "page", /name=\{entry\.load_number\}/, "name={entry.load_id}"],
    ["customer-label", "page", /name=\{entry\.customer_name\}/, "name={entry.customer_id}"],
    ["scope", "service", /(customerBelongsToCompany[\s\S]{0,420})operating_company_id = \$1::uuid/, "$1TRUE"],
    ["active", "service", /(customerBelongsToCompany[\s\S]{0,420})deactivated_at IS NULL/, "$1TRUE"],
    ["eta-view", "service", /FROM views\.dispatch_load_with_driver_status l/, "FROM mdata.loads l"],
    ["missing", "service", /E_CUSTOMER_NOT_FOUND/g, "E_WRONG"],
    ["prefs", "reverse", /getCustomerNotifyPreferences\(customerId, operatingCompanyId\)/, "getCustomerNotifyPreferences(operatingCompanyId, customerId)"],
    ["log", "reverse", /getCustomerNotifyLog\(operatingCompanyId, customerId\)/, "getCustomerNotifyLog(operatingCompanyId)"],
    ["preference-retry", "reverse", /preferences\.refetch\(\)/, "log.refetch()"],
    ["history-retry", "reverse", /log\.refetch\(\)/, "preferences.refetch()"],
    ["success-gate", "reverse", /!preferences\.isError && !log\.isError/, "!preferences.isError"],
    ["drill", "reverse", /kind="customer_notify_preferences"/, 'kind="broken_notify"'],
    ["mount", "customer", /CustomerNotifyReverseSection/g, "MissingNotifyReverse"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) { console.error(`${LABEL} SELFTEST FAIL — ${name}`); process.exit(1); }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`); process.exit(0);
}
const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — customer picker→active tenant writer→exact preferences/log reverse→customer profile`);
