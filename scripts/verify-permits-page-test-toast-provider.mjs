#!/usr/bin/env node
/**
 * verify-permits-page-test-toast-provider
 * SAF-PERMITS-TEST-TOAST — PermitsPage test harness must wrap ToastProvider because
 * EntityPicker allowCreate mounts CreateUnitModal → useToast.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-permits-page-test-toast-provider";
const TARGET = "apps/frontend/src/pages/safety/__tests__/PermitsPage.test.tsx";

function assertSrc(src) {
  const errors = [];
  if (!src.includes("ToastProvider")) errors.push("must import/use ToastProvider");
  if (!/<ToastProvider>/.test(src)) errors.push("must wrap UI in <ToastProvider>");
  if (!src.includes("PermitsPage")) errors.push("must keep PermitsPage under test");
  return errors;
}

function selftest() {
  const bad = `function wrap(ui) { return <QueryClientProvider><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>; }`;
  const good = `import { ToastProvider } from "../../../components/Toast";
function wrap(ui) { return <QueryClientProvider><ToastProvider><MemoryRouter>{ui}</MemoryRouter></ToastProvider></QueryClientProvider>; }
<PermitsPage`;
  if (assertSrc(bad).length === 0 || assertSrc(good).length > 0) {
    console.error(`${LABEL} SELFTEST FAIL`, { bad: assertSrc(bad), good: assertSrc(good) });
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertSrc(fs.readFileSync(path.join(process.cwd(), TARGET), "utf8"));
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — PermitsPage test wraps ToastProvider`);
