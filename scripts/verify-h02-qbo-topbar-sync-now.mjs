// h-02-qbo-sync-stale-no-action — stale QBO sync pill must expose last-success time + Sync now action.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const topStatusBar = read("apps/frontend/src/components/layout/TopStatusBar.tsx");
const topbar = read("apps/frontend/src/components/Topbar.tsx");
const qboApi = read("apps/frontend/src/api/qbo-integration.ts");
const pkg = read("package.json");

const checks = [
  ["TopStatusBar shows last-success test id", /data-testid="qbo-sync-last-success"/.test(topStatusBar)],
  ["TopStatusBar has distinct Sync now button", /data-testid="qbo-sync-now-button"/.test(topStatusBar)],
  ["TopStatusBar renders lastSuccessLabel on pill", /lastSuccessLabel/.test(topStatusBar)],
  ["Topbar wires onSyncNow handler", /onSyncNow=/.test(topbar)],
  ["Topbar calls master-data sync trigger API", /postQboMasterDataSyncTriggerFull/.test(topbar)],
  ["qbo-integration exports sync trigger helper", /postQboMasterDataSyncTriggerFull/.test(qboApi)],
  [
    "qbo-integration targets existing backend route",
    /\/api\/v1\/qbo\/master-data-sync\/trigger-full/.test(qboApi),
  ],
  ["guard script registered in package.json", /verify:h02-qbo-topbar-sync-now/.test(pkg)],
];

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length > 0) {
  console.error("verify:h02-qbo-topbar-sync-now FAILED —");
  for (const name of failed) console.error(`  - ${name}`);
  process.exit(1);
}

console.log("verify:h02-qbo-topbar-sync-now OK");
