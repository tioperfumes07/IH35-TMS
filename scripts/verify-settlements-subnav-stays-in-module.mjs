#!/usr/bin/env node
/**
 * Register row 125 / audit D006 (Lead 443.301): Settlements › Drivers linked to /drivers — outside the Settlements
 * module, so the tab bar and sidebar context were lost. Fixed by 443.258-B (0512ef14cd); this guard keeps it fixed:
 * every SETTLEMENTS_SUBNAV target stays under /driver-finance/, and no non-test file under pages/driver-finance
 * links or navigates to a bare /drivers route. --selftest plants both forms.
 */
import fs from "node:fs";
import path from "node:path";
const LABEL = "verify-settlements-subnav-stays-in-module";
const SUBNAV = "apps/frontend/src/pages/driver-finance/settlementsSubnav.ts";
const DIR = "apps/frontend/src/pages/driver-finance";
const DRIVERS = "apps/frontend/src/pages/Drivers.tsx";
const BARE = /(?:to=|navigate\(|href=|to:\s*)["'`]\/drivers(?:["'`?/])/;
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";
export function check(subnavSrc, files, manifestSrc = fs.readFileSync(MANIFEST, "utf8"), driversSrc = fs.readFileSync(DRIVERS, "utf8")) {
  const v = [];
  for (const m of subnavSrc.matchAll(/to:\s*"([^"]+)"/g)) {
    if (!m[1].startsWith("/driver-finance/")) { v.push(`${SUBNAV}: tab target ${m[1]} leaves the Settlements module`); continue; }
    // Rows 126-133 (D007-D014): every in-module tab must land on a MOUNTED route, never a 404 / catch-all.
    const routePath = m[1].split("?")[0];
    if (!manifestSrc.includes(`path="${routePath}"`)) v.push(`${SUBNAV}: tab target ${routePath} has no route in ${MANIFEST}`);
  }
  for (const [f, s] of files) s.split("\n").forEach((l, i) => { if (BARE.test(l)) v.push(`${f}:${i + 1}: links to bare /drivers (leaves Settlements)`); });
  // Codex audit row185: DriversPage embedded under Settlements must remap KPI destinations in-module
  // and suppress the nested Drivers NavyPageSubNav (outer SettlementsModuleShell owns chrome).
  if (!/underSettlements\s*=\s*location\.pathname\.startsWith\("\/driver-finance"\)/.test(driversSrc)) {
    v.push(`${DRIVERS}: must detect underSettlements via /driver-finance pathname`);
  }
  if (!/\/driver-finance\/cash-advances/.test(driversSrc) || !/\/driver-finance\/escrow/.test(driversSrc)) {
    v.push(`${DRIVERS}: KPI destinations must remap to /driver-finance/cash-advances + /escrow under Settlements`);
  }
  // Bind to the actual nav mount (Codex batch44): a global !underSettlements regex also matches
  // the Duplicate-profiles link — that alone must not green this check. Require the subnav
  // testid to sit inside the underSettlements-gated branch.
  if (!/!underSettlements\s*\?\s*\(\s*<div\s+data-testid="drivers-unified-subnav"/.test(driversSrc)) {
    v.push(`${DRIVERS}: must suppress drivers-unified-subnav when underSettlements (testid must sit in the gated branch)`);
  }
  return v;
}
const walk = (d, a = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, a); else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) a.push([p, fs.readFileSync(p, "utf8")]); } return a; };
const sub = fs.readFileSync(SUBNAV, "utf8"); const files = walk(DIR); const drivers = fs.readFileSync(DRIVERS, "utf8");
if (process.argv.includes("--selftest")) {
  if (check(sub, files).length) { console.error(`${LABEL} SELFTEST FAIL: clean tree rejected`); process.exit(1); }
  const p1 = check(sub.replace('to: "/driver-finance/drivers"', 'to: "/drivers"'), files).length > 0;
  const p2 = check(sub, [["plant.tsx", '<Link to="/drivers">Drivers</Link>']]).length > 0;
  const p3 = check(sub, files, fs.readFileSync(MANIFEST, "utf8").replace('path="/driver-finance/deductions"', 'path="/gone"')).length > 0;
  const p4 = check(sub, files, undefined, drivers.replace("underSettlements = location.pathname.startsWith(\"/driver-finance\")", "underSettlements = false")).length > 0;
  // Codex batch44 escaped plant: flip only the subnav gate to {true ? ( — Duplicate-profiles
  // !underSettlements elsewhere must not keep this green.
  const subnavGateFrom = "{!underSettlements ? (\n        <div data-testid=\"drivers-unified-subnav\"";
  const subnavGateTo = "{true ? (\n        <div data-testid=\"drivers-unified-subnav\"";
  if (!drivers.includes(subnavGateFrom)) {
    console.error(`${LABEL} SELFTEST FAIL: subnav gate plant target missing — guard out of sync`);
    process.exit(1);
  }
  const p5 = check(sub, files, undefined, drivers.replace(subnavGateFrom, subnavGateTo)).length > 0;
  if (!p1 || !p2 || !p3 || !p4 || !p5) {
    console.error(`${LABEL} SELFTEST FAIL: plant escaped (${p1 ? "" : "subnav "}${p2 ? "" : "page "}${p3 ? "" : "route "}${p4 ? "" : "drivers-embed "}${p5 ? "" : "subnav-gate"})`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS 5/5`); process.exit(0);
}
const v = check(sub, files);
if (v.length) { console.error(`${LABEL}: FAIL\n  ${v.join("\n  ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — every Settlements tab under /driver-finance/ with a mounted route; 0 bare /drivers links in ${files.length} files; Drivers embed module-aware`);
