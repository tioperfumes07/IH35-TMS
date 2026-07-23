#!/usr/bin/env node
/**
 * Banking Full Audit FAIL-6 + FAIL-7 — Factoring (Faro) + Relay Card are first-class Banking tabs
 * (thin entry → /factoring and Relay register), not Accounts-only widgets.
 */
import fs from "node:fs";

const NAV = "apps/frontend/src/pages/banking/BANKING_NAV_CONFIG.ts";
const PATHS = "apps/frontend/src/router/route-manifest.ts";
const HOME = "apps/frontend/src/pages/banking/BankingHome.tsx";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";
const DESIGN = "docs/specs/IH35_ARCHITECTURAL_DESIGN.md";
const SIDEBAR = "apps/frontend/src/components/layout/sidebar-config.ts";

export function run(root = process.cwd()) {
  const failures = [];
  const nav = fs.readFileSync(`${root}/${NAV}`, "utf8");
  const paths = fs.readFileSync(`${root}/${PATHS}`, "utf8");
  const home = fs.readFileSync(`${root}/${HOME}`, "utf8");
  const manifest = fs.readFileSync(`${root}/${MANIFEST}`, "utf8");
  const design = fs.readFileSync(`${root}/${DESIGN}`, "utf8");
  const sidebar = fs.readFileSync(`${root}/${SIDEBAR}`, "utf8");

  for (const id of ["factoring", "relay_card"]) {
    if (!nav.includes(`id: "${id}"`)) failures.push(`BANKING_MODULE_TABS missing ${id}`);
  }
  if (!paths.includes('factoring: "/banking/factoring"')) failures.push("BANKING_TAB_PATH missing factoring");
  if (!paths.includes('relay_card: "/banking/relay"')) failures.push("BANKING_TAB_PATH missing relay_card");
  if (!paths.includes('pathname === "/banking/factoring"')) failures.push("bankingTabFromPath missing factoring");
  if (!paths.includes('pathname === "/banking/relay"')) failures.push("bankingTabFromPath missing relay");
  if (!manifest.includes('path="/banking/factoring"')) failures.push("manifest missing /banking/factoring");
  if (!manifest.includes('path="/banking/relay"')) failures.push("manifest missing /banking/relay");
  if (!home.includes('activeTab === "factoring"')) failures.push("BankingHome missing factoring tab body");
  if (!home.includes('activeTab === "relay_card"')) failures.push("BankingHome missing relay_card tab body");
  if (!home.includes('navigate("/factoring")') && !home.includes('to="/factoring"')) {
    failures.push("Factoring tab must deep-link to /factoring");
  }
  if (!sidebar.includes("/banking/factoring") || !sidebar.includes("/banking/relay")) {
    failures.push("sidebar bank flyout must include Factoring + Relay");
  }
  if (!design.includes("**Reports**") || !design.includes("/banking/factoring")) {
    failures.push("IH35_ARCHITECTURAL_DESIGN Module 4 must document Reports + /banking/factoring (Rule 05)");
  }
  // Keep Accounts factoring card (Rule 07 additive)
  if (!home.includes("Factoring · virtual bank")) {
    failures.push("Accounts home Factoring card must remain (never delete)");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-factoring-relay-");
  const files = {
    [NAV]: `id: "factoring"\nid: "relay_card"\n`,
    [PATHS]: `factoring: "/banking/factoring"\nrelay_card: "/banking/relay"\npathname === "/banking/factoring"\npathname === "/banking/relay"\n`,
    [HOME]: `activeTab === "factoring"\nactiveTab === "relay_card"\nto="/factoring"\nFactoring · virtual bank\n`,
    [MANIFEST]: `path="/banking/factoring"\npath="/banking/relay"\n`,
    [DESIGN]: `**Reports**\n/banking/factoring\n`,
    [SIDEBAR]: `/banking/factoring\n/banking/relay\n`,
  };
  for (const [rel, body] of Object.entries(files)) {
    const dir = `${tmp}/${rel.split("/").slice(0, -1).join("/")}`;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  }
  if (run(tmp).length) throw new Error("expected PASS " + run(tmp).join(";"));
  fs.writeFileSync(`${tmp}/${HOME}`, `no tabs\n`);
  if (!run(tmp).length) throw new Error("expected FAIL");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-factoring-relay-tabs --selftest OK");
} else {
  const failures = run();
  if (failures.length) {
    console.error("verify-banking-factoring-relay-tabs FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    process.exit(1);
  }
  console.log("verify-banking-factoring-relay-tabs — OK");
}
