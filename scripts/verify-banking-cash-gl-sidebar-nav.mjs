#!/usr/bin/env node
/**
 * Banking Full Audit FAIL-3 + FAIL-5:
 * - Cash GL setup must be reachable from Banking Home (not a routed orphan)
 * - Sidebar bank flyout must expose the live BANKING_MODULE_TABS paths
 */
import fs from "node:fs";

const HOME = "apps/frontend/src/pages/banking/BankingHome.tsx";
const SIDEBAR = "apps/frontend/src/components/layout/sidebar-config.ts";
const NAV = "apps/frontend/src/pages/banking/BANKING_NAV_CONFIG.ts";

function read(p) {
  return fs.readFileSync(p, "utf8");
}

export function run(root = process.cwd()) {
  const failures = [];
  const home = read(`${root}/${HOME}`);
  const sidebar = read(`${root}/${SIDEBAR}`);
  const nav = read(`${root}/${NAV}`);

  if (!home.includes('navigate("/banking/cash-gl-setup")')) {
    failures.push("BankingHome must navigate to /banking/cash-gl-setup (Cash GL action or unbound-register path)");
  }
  if (!home.includes("Cash GL setup")) {
    failures.push("BankingHome Accounts tab must expose Cash GL setup action label");
  }

  const requiredFlyout = [
    "/banking/transactions",
    "/banking/reconciliation",
    "/banking/driver-escrow",
    "/banking/reports",
    "/banking/cash-gl-setup",
  ];
  for (const path of requiredFlyout) {
    if (!sidebar.includes(path)) {
      failures.push(`sidebar bank flyout missing ${path}`);
    }
  }
  // Fuel Planner has its own sidebar item — must not be the only Banking deep link substitute.
  const bankCase = sidebar.match(/case "bank":[\s\S]*?case "/);
  if (bankCase && /to: "\/fuel"/.test(bankCase[0]) && !/driver-escrow/.test(bankCase[0])) {
    failures.push("bank flyout still substitutes Fuel Planner for Banking tabs");
  }

  for (const id of ["accounts", "transactions", "reconciliation", "factoring", "driver_escrow", "relay_card", "reports", "settings"]) {
    if (!nav.includes(`id: "${id}"`)) failures.push(`BANKING_MODULE_TABS missing ${id}`);
  }

  return failures;
}

function selftest() {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-cash-gl-");
  try {
    fs.mkdirSync(`${tmp}/apps/frontend/src/pages/banking`, { recursive: true });
    fs.mkdirSync(`${tmp}/apps/frontend/src/components/layout`, { recursive: true });
    fs.writeFileSync(
      `${tmp}/${HOME}`,
      `navigate("/banking/cash-gl-setup")\nCash GL setup\n`
    );
    fs.writeFileSync(
      `${tmp}/${SIDEBAR}`,
      `case "bank":\n return [\n { to: "/banking/transactions" },\n { to: "/banking/reconciliation" },\n { to: "/banking/driver-escrow" },\n { to: "/banking/reports" },\n { to: "/banking/cash-gl-setup" },\n ];\ncase "x":`
    );
    fs.writeFileSync(
      `${tmp}/${NAV}`,
      `id: "accounts"\nid: "transactions"\nid: "reconciliation"\nid: "factoring"\nid: "driver_escrow"\nid: "relay_card"\nid: "reports"\nid: "settings"\n`
    );
    if (run(tmp).length) throw new Error("expected PASS");
    fs.writeFileSync(`${tmp}/${HOME}`, `// orphan again\n`);
    if (!run(tmp).length) throw new Error("expected FAIL on orphan");
    console.log("verify-banking-cash-gl-sidebar-nav --selftest OK");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = run();
  if (failures.length) {
    console.error("verify-banking-cash-gl-sidebar-nav FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify-banking-cash-gl-sidebar-nav — OK");
}
