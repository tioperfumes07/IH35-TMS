#!/usr/bin/env node
/**
 * Factoring qbo_chrome — leaf-specific Built for the 4 leaves only "claimed" by the broad
 * verify-cursor-vertical-qbo-picker-modules.mjs sweep (leafRe: ^(batches|factoring)(\.|$)) — same
 * theater-coverage class already found+fixed across every other module this session. 12 of
 * factoring's 17 qbo_chrome leaves already have real, dedicated coverage via
 * verify-factoring-qbo-chrome-surfaces.mjs (home/accounting/toolbar) — confirmed still green, not
 * re-claimed here. These 4 were the only genuine gap:
 *   - batches.create / factoring.wizard.batch: BatchWizard.tsx (mounted at the batches.create route
 *     /factoring/batches/new) — a real page-based creator with PageHeader + a real ParityTable
 *     invoice-selection grid.
 *   - factoring.modal.deactivate_factor_confirm: DeactivateFactorConfirmModal.tsx, a real Modal.
 *   - factoring.modal.reserve_dashboard_add_factor: ReserveDashboardAddFactorModal.tsx, a real
 *     Modal variant="drawer".
 *
 * @matrix-built {"modules":["factoring"],"cols":["qbo_chrome"],"leafRe":"^batches\\.create$","task":"VERTICAL-QBO-CHROME-factoring-batches-create","vertical":"column-wave"}
 * @matrix-built {"modules":["factoring"],"cols":["qbo_chrome"],"leafRe":"^factoring\\.wizard\\.batch$","task":"VERTICAL-QBO-CHROME-factoring-wizard-batch","vertical":"column-wave"}
 * @matrix-built {"modules":["factoring"],"cols":["qbo_chrome"],"leafRe":"^factoring\\.modal\\.deactivate_factor_confirm$","task":"VERTICAL-QBO-CHROME-factoring-deactivate-confirm","vertical":"column-wave"}
 * @matrix-built {"modules":["factoring"],"cols":["qbo_chrome"],"leafRe":"^factoring\\.modal\\.reserve_dashboard_add_factor$","task":"VERTICAL-QBO-CHROME-factoring-add-factor","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-factoring-batch-wizard-qbo-chrome.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-batch-wizard-qbo-chrome";

const CHECKS = [
  {
    name: "batches.create / factoring.wizard.batch: BatchWizard real PageHeader + ParityTable",
    file: "apps/frontend/src/pages/factoring/BatchWizard.tsx",
    pattern: /<PageHeader[\s\S]{0,3200}<ParityTable/,
  },
  {
    name: "factoring.modal.deactivate_factor_confirm: real Modal",
    file: "apps/frontend/src/components/factoring/DeactivateFactorConfirmModal.tsx",
    pattern: /<Modal open=\{open\} onClose=\{onClose\} title="Deactivate active factor"/,
  },
  {
    name: "factoring.modal.reserve_dashboard_add_factor: real Modal variant=drawer",
    file: "apps/frontend/src/pages/factoring/ReserveDashboardAddFactorModal.tsx",
    pattern: /<Modal open=\{open\} onClose=\{onClose\} title="Add Factor" variant="drawer"/,
  },
];

function runChecks(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    if (!c.pattern.test(src)) fails.push(`${c.name}: pattern miss in ${c.file}`);
  }
  return fails;
}

function selftest() {
  const live = runChecks();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".factoring-batch-wizard-qbo-chrome-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison — no chrome\n");
    }
    const planted = runChecks(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL — planted chrome misses not caught (${planted.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) {
    console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const fails = runChecks();
if (fails.length) {
  console.error(`${LABEL} FAIL (${fails.length}):\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ${CHECKS.length} checks / 4 factoring qbo_chrome leaf asserts`);
