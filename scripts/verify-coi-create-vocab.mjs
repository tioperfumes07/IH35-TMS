#!/usr/bin/env node
/**
 * 0441-mod9-coi-duplicated-feature-unequal (vocab slice)
 *
 * Both live COI surfaces must use locked "+ Create" primary vocabulary — never
 * "Request COI" / "Request New COI" / "Create Request" / "Submit Request".
 * Full component consolidation is deferred; this guard prevents vocab regression.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LABEL = "verify:coi-create-vocab";

const paths = {
  coiRequestsTab: path.join(ROOT, "apps/frontend/src/pages/customers/tabs/CoiRequestsTab.tsx"),
  customerCoiTab: path.join(ROOT, "apps/frontend/src/pages/customers/CustomerCOITab.tsx"),
};

const FORBIDDEN = [
  "Request New COI",
  "Request COI",
  "Create Request",
  "Submit Request",
  "Close Request Form",
];

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

/** @param {{ coiRequestsTab: string; customerCoiTab: string }} sources */
export function collectFailures({ coiRequestsTab, customerCoiTab }) {
  const failures = [];

  if (!coiRequestsTab.includes("+ Create COI")) {
    failures.push("CoiRequestsTab primary CTA must say + Create COI");
  }
  if (!coiRequestsTab.includes("+ Create")) {
    failures.push("CoiRequestsTab modal submit must say + Create");
  }
  if (!customerCoiTab.includes("+ Create COI")) {
    failures.push("CustomerCOITab primary CTA must say + Create COI");
  }
  if (!customerCoiTab.includes("+ Create")) {
    failures.push("CustomerCOITab inline submit must say + Create");
  }

  for (const [rel, src] of [
    ["CoiRequestsTab.tsx", coiRequestsTab],
    ["CustomerCOITab.tsx", customerCoiTab],
  ]) {
    for (const phrase of FORBIDDEN) {
      if (src.includes(phrase)) {
        failures.push(`${rel} must not contain forbidden label "${phrase}"`);
      }
    }
  }

  return failures;
}

function selftest() {
  const good = collectFailures({
    coiRequestsTab: read(paths.coiRequestsTab),
    customerCoiTab: read(paths.customerCoiTab),
  });
  if (good.length) {
    console.error(`${LABEL} SELFTEST FAIL — live sources should pass before selftest`);
    process.exit(1);
  }

  const planted = collectFailures({
    coiRequestsTab: read(paths.coiRequestsTab).replace("+ Create COI", "Request New COI"),
    customerCoiTab: read(paths.customerCoiTab),
  });
  if (!planted.some((f) => f.includes("Request New COI"))) {
    console.error(`${LABEL} SELFTEST FAIL — did not detect planted violation`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

function main() {
  const failures = collectFailures({
    coiRequestsTab: read(paths.coiRequestsTab),
    customerCoiTab: read(paths.customerCoiTab),
  });

  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log(`${LABEL} OK — both COI surfaces use + Create vocabulary`);
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else main();
}
