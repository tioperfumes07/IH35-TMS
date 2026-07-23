#!/usr/bin/env node
/** Banking Full Audit FAIL-4 — Email Queue must not be a routed orphan. */
import fs from "node:fs";

const HOME = "apps/frontend/src/pages/banking/BankingHome.tsx";
const SIDEBAR = "apps/frontend/src/components/layout/sidebar-config.ts";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

export function run(root = process.cwd()) {
  const failures = [];
  const home = fs.readFileSync(`${root}/${HOME}`, "utf8");
  const sidebar = fs.readFileSync(`${root}/${SIDEBAR}`, "utf8");
  const manifest = fs.readFileSync(`${root}/${MANIFEST}`, "utf8");
  if (!manifest.includes('path="/banking/email-queue"')) {
    failures.push("manifest must mount /banking/email-queue");
  }
  if (!home.includes('navigate("/banking/email-queue")')) {
    failures.push("BankingHome must navigate to /banking/email-queue for Owner/Admin");
  }
  if (!sidebar.includes("/banking/email-queue")) {
    failures.push("sidebar bank flyout must include /banking/email-queue");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-email-");
  fs.mkdirSync(`${tmp}/apps/frontend/src/pages/banking`, { recursive: true });
  fs.mkdirSync(`${tmp}/apps/frontend/src/components/layout`, { recursive: true });
  fs.mkdirSync(`${tmp}/apps/frontend/src/routes`, { recursive: true });
  fs.writeFileSync(`${tmp}/${HOME}`, `navigate("/banking/email-queue")\n`);
  fs.writeFileSync(`${tmp}/${SIDEBAR}`, `/banking/email-queue\n`);
  fs.writeFileSync(`${tmp}/${MANIFEST}`, `path="/banking/email-queue"\n`);
  if (run(tmp).length) throw new Error("expected PASS");
  fs.writeFileSync(`${tmp}/${HOME}`, `orphan\n`);
  if (!run(tmp).length) throw new Error("expected FAIL");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-email-queue-nav --selftest OK");
} else {
  const failures = run();
  if (failures.length) {
    console.error("verify-banking-email-queue-nav FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    process.exit(1);
  }
  console.log("verify-banking-email-queue-nav — OK");
}
