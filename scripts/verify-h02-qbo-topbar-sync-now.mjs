// h-02-qbo-sync-stale-no-action — stale QBO sync pill must expose last-success time + Sync now action.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const TOP_STATUS_BAR = "apps/frontend/src/components/layout/TopStatusBar.tsx";
const STATUS_BAR_MOBILE = "apps/frontend/src/components/layout/StatusBarMobile.tsx";
const TOPBAR = "apps/frontend/src/components/Topbar.tsx";
const QBO_API = "apps/frontend/src/api/qbo-integration.ts";
const TEST = "apps/frontend/src/components/layout/TopStatusBar.qbo-sync.test.tsx";

function hasSkyClass(source) {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const stringLiterals = withoutComments.match(/(["'`])(?:\\.|(?!\1)[\s\S])*\1/g) ?? [];
  return stringLiterals.some((value) => /\bsky-/.test(value));
}

function collectFailures({ topStatusBar, statusBarMobile, topbar, qboApi, test, pkg }) {
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
    [
      "mobile tests exercise TopStatusBar compact-mode wiring",
      /setCompactViewport\(true\)[\s\S]*<TopStatusBar/.test(test),
    ],
    ["mobile tests cover Last OK", /describe\("StatusBarMobile[\s\S]*Last OK:/.test(test)],
    ["mobile tests cover Sync now", /describe\("StatusBarMobile[\s\S]*name: "Sync now"/.test(test)],
    ["mobile tests cover Syncing", /describe\("StatusBarMobile[\s\S]*name: "Syncing…"/.test(test)],
    [
      "mobile tests cover reconnect",
      /describe\("StatusBarMobile[\s\S]*name: "Reconnect QuickBooks"/.test(test),
    ],
    [
      "mobile tests cover dashboard action",
      /describe\("StatusBarMobile[\s\S]*View sync dashboard/.test(test),
    ],
    ["guard script registered in package.json", /verify:h02-qbo-topbar-sync-now/.test(pkg)],
  ];

  const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (hasSkyClass(topStatusBar)) {
    failures.push(`${TOP_STATUS_BAR}: Sync-now/status controls must not use sky-* classes`);
  }
  if (hasSkyClass(statusBarMobile)) {
    failures.push(`${STATUS_BAR_MOBILE}: Sync-now/status controls must not use sky-* classes`);
  }
  return failures;
}

const sources = {
  topStatusBar: read(TOP_STATUS_BAR),
  statusBarMobile: read(STATUS_BAR_MOBILE),
  topbar: read(TOPBAR),
  qboApi: read(QBO_API),
  test: read(TEST),
  pkg: read("package.json"),
};

if (process.argv.includes("--selftest")) {
  const cleanFailures = collectFailures(sources);
  if (cleanFailures.length > 0) {
    console.error("verify:h02-qbo-topbar-sync-now --selftest FAILED — clean tree did not pass");
    for (const name of cleanFailures) console.error(`  - ${name}`);
    process.exit(1);
  }

  const plantedFailures = collectFailures({
    ...sources,
    topStatusBar: `${sources.topStatusBar}\nconst planted = <button className='text-sky-400' />;`,
    statusBarMobile:
      `${sources.statusBarMobile}\nconst planted = <button className={clsx("border-sky-500")} />;`,
  });
  const caughtDesktop = plantedFailures.some((failure) => failure.includes(TOP_STATUS_BAR));
  const caughtMobile = plantedFailures.some((failure) => failure.includes(STATUS_BAR_MOBILE));
  if (!caughtDesktop || !caughtMobile) {
    console.error(
      "verify:h02-qbo-topbar-sync-now --selftest FAILED — planted sky-* regressions escaped"
    );
    process.exit(1);
  }

  console.log("verify:h02-qbo-topbar-sync-now --selftest PASS");
  process.exit(0);
}

const failed = collectFailures(sources);
if (failed.length > 0) {
  console.error("verify:h02-qbo-topbar-sync-now FAILED —");
  for (const name of failed) console.error(`  - ${name}`);
  process.exit(1);
}

console.log("verify:h02-qbo-topbar-sync-now OK");
