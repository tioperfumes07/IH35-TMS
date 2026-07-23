#!/usr/bin/env node
/**
 * Banking Full Audit FAIL-9 — architectural design Module 4 must stay linked to live Banking tabs.
 * Rule 05 claims verify:arch-design enforces the MD; the lock-file guard only prevents removals.
 * This guard closes the Banking doc↔code loop without thrashing package.json (Rule 17).
 */
import fs from "node:fs";

const DESIGN = "docs/specs/IH35_ARCHITECTURAL_DESIGN.md";
const NAV = "apps/frontend/src/pages/banking/BANKING_NAV_CONFIG.ts";
const PATHS = "apps/frontend/src/router/route-manifest.ts";

const REQUIRED_LIVE_TAB_IDS = [
  "accounts",
  "transactions",
  "reconciliation",
  "factoring",
  "driver_escrow",
  "relay_card",
  "reports",
  "statement_import",
  "plaid_connections",
  "settings",
];

const REQUIRED_DESIGN_NEEDLES = [
  "MODULE 4 — BANKING",
  "/banking/factoring",
  "/banking/relay",
  "/banking/statement-import",
  "/banking/plaid-connections",
  "/banking/settings",
  "**Reports**",
  "**Relay Card**",
  "**Factoring (Faro)**",
  "**Plaid Connections**",
];

export function run(root = process.cwd()) {
  const failures = [];
  const design = fs.readFileSync(`${root}/${DESIGN}`, "utf8");
  const nav = fs.readFileSync(`${root}/${NAV}`, "utf8");
  const paths = fs.readFileSync(`${root}/${PATHS}`, "utf8");

  const mod4 = design.split("## MODULE 4 — BANKING")[1]?.split("## MODULE 5")[0] ?? "";
  if (!mod4.trim()) failures.push("IH35_ARCHITECTURAL_DESIGN missing MODULE 4 — BANKING section");

  for (const needle of REQUIRED_DESIGN_NEEDLES) {
    if (!design.includes(needle)) failures.push(`design missing ${needle}`);
  }

  for (const id of REQUIRED_LIVE_TAB_IDS) {
    if (!nav.includes(`id: "${id}"`)) failures.push(`BANKING_MODULE_TABS missing ${id}`);
  }

  for (const path of [
    "/banking/factoring",
    "/banking/relay",
    "/banking/statement-import",
    "/banking/plaid-connections",
    "/banking/settings",
  ]) {
    if (!paths.includes(`"${path}"`)) failures.push(`BANKING_TAB_PATH missing ${path}`);
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-arch-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  mk(
    DESIGN,
    "## MODULE 4 — BANKING\n/banking/factoring\n/banking/relay\n/banking/statement-import\n/banking/plaid-connections\n/banking/settings\n**Reports**\n**Relay Card**\n**Factoring (Faro)**\n**Plaid Connections**\n## MODULE 5\n"
  );
  mk(
    NAV,
    REQUIRED_LIVE_TAB_IDS.map((id) => `id: "${id}"`).join("\n") + "\n"
  );
  mk(
    PATHS,
    `"/banking/factoring"\n"/banking/relay"\n"/banking/statement-import"\n"/banking/plaid-connections"\n"/banking/settings"\n`
  );
  if (run(tmp).length) throw new Error("expected PASS: " + run(tmp).join("; "));
  mk(NAV, 'id: "accounts"\n');
  if (!run(tmp).length) throw new Error("expected FAIL");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-arch-design-tabs --selftest OK");
} else {
  const failures = run();
  if (failures.length) {
    console.error("verify-banking-arch-design-tabs FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    process.exit(1);
  }
  console.log("verify-banking-arch-design-tabs — OK");
}
