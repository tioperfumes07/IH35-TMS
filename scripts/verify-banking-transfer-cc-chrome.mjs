#!/usr/bin/env node
/**
 * Banking Full Audit FAIL 30 — Record Transfer / Pay CC / Transfer money creators
 * must use QBO-like ParityDrawer (not centered Modal / thin full page).
 */
import fs from "node:fs";

const TARGETS = [
  "apps/frontend/src/pages/banking/RecordTransferModal.tsx",
  "apps/frontend/src/pages/banking/RecordCCPaymentModal.tsx",
  "apps/frontend/src/pages/banking/TransferModal.tsx",
];

export function run(root = process.cwd()) {
  const failures = [];
  for (const rel of TARGETS) {
    const path = `${root}/${rel}`;
    if (!fs.existsSync(path)) {
      failures.push(`missing ${rel}`);
      continue;
    }
    const src = fs.readFileSync(path, "utf8");
    if (!src.includes("ParityDrawer") || !src.includes('from "../../components/parity/ParityDrawer"')) {
      failures.push(`${rel} must import and render ParityDrawer`);
    }
    if (/from ["'].*\/Modal["']/.test(src) || /<Modal[\s>]/.test(src)) {
      failures.push(`${rel} must not use centered Modal for money create chrome`);
    }
    if (!src.includes("<ParityDrawer")) {
      failures.push(`${rel} must render <ParityDrawer`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-transfer-cc-chrome-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  for (const rel of TARGETS) {
    mk(rel, `import { ParityDrawer } from "../../components/parity/ParityDrawer";\n<ParityDrawer open title="x" onClose={() => {}}>\n</ParityDrawer>\n`);
  }
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));
  mk(TARGETS[0], `import { Modal } from "../../components/Modal";\n<Modal open>\n</Modal>\n`);
  if (!run(tmp).length) throw new Error("FAIL fail: Modal should trip");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-transfer-cc-chrome --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-banking-transfer-cc-chrome — OK");
}
