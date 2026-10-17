import fs from "node:fs";
import path from "node:path";

// Each master-data route must read its CANONICAL local table, never a remote/mirror source.
// 443.138 9c (300b098fa0, #26733): accounts and items are canonical in catalogs.accounts / catalogs.items (project law:
// catalogs.accounts is the accounts hub); reading mdata.qbo_accounts / mdata.qbo_items (the QBO mirror) returned zero
// rows in USMCA. So those two routes must read catalogs.* AND must not read the QBO mirror; the rest read mdata.*.
const repoRoot = process.cwd();
const routeDir = path.join(repoRoot, "apps", "backend", "src", "mdata");
const MDATA = { label: "missing_local_mdata_read", re: /\bfrom\s+mdata\./i };
export const ROUTES = {
  "vendors.routes.ts": MDATA,
  "customers.routes.ts": MDATA,
  "accounts.routes.ts": { label: "missing_canonical_catalogs_accounts_read", re: /\bfrom\s+catalogs\.accounts\b/i, mirror: /\bmdata\.qbo_accounts\b/i },
  "items.routes.ts": { label: "missing_canonical_catalogs_items_read", re: /\bfrom\s+catalogs\.items\b/i, mirror: /\bmdata\.qbo_items\b/i },
  "drivers.routes.ts": MDATA,
  "units.routes.ts": MDATA,
  "equipment.routes.ts": MDATA,
};
const disallowedRemoteReadPatterns = [/\bqbo_archive\./i, /\bintegrations\.samsara_(drivers|vehicles)\b/i];

export function check(fileName, content) {
  const v = [];
  const rule = ROUTES[fileName];
  if (!rule.re.test(content)) v.push(`${fileName}:${rule.label}`);
  if (rule.mirror && rule.mirror.test(content)) v.push(`${fileName}:qbo_mirror_read:${rule.mirror}`);
  for (const pattern of disallowedRemoteReadPatterns) {
    if (pattern.test(content)) v.push(`${fileName}:disallowed_remote_read:${pattern}`);
  }
  return v;
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["accounts on catalogs passes", check("accounts.routes.ts", "SELECT id FROM catalogs.accounts WHERE x").length === 0],
    ["accounts back on the QBO mirror fails", check("accounts.routes.ts", "SELECT id FROM mdata.qbo_accounts").length > 0],
    ["items with no canonical read fails", check("items.routes.ts", "SELECT 1").length > 0],
    ["vendors without mdata fails", check("vendors.routes.ts", "SELECT id FROM catalogs.items").length > 0],
    ["vendors reading qbo_archive fails", check("vendors.routes.ts", "SELECT 1 FROM mdata.vendors JOIN qbo_archive.vendors").length > 0],
  ];
  const bad = cases.filter(([, ok]) => !ok).map(([n]) => n);
  if (bad.length) { console.error(`verify-mdata-routes-local-first --selftest FAIL: ${bad.join("; ")}`); process.exit(1); }
  console.log(`verify-mdata-routes-local-first --selftest PASS ${cases.length}/${cases.length}`);
  process.exit(0);
}

const violations = [];
for (const fileName of Object.keys(ROUTES)) {
  const filePath = path.join(routeDir, fileName);
  if (!fs.existsSync(filePath)) {
    violations.push(`${fileName}:missing_route_file`);
    continue;
  }
  violations.push(...check(fileName, fs.readFileSync(filePath, "utf8")));
}

if (violations.length > 0) {
  console.error("verify-mdata-routes-local-first failed:");
  for (const violation of violations) console.error(` - ${violation}`);
  process.exit(1);
}

console.log("verify-mdata-routes-local-first passed");
