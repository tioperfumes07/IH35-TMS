#!/usr/bin/env node
/**
 * verify-fuel-recon-manual-match-honest — Save link must not fake-persist.
 *
 * Until POST /fuel-reconciliation/manual-match exists: button disabled with honest title,
 * OR onClick must call a real mutation (not only setMatchOpen/setMatchNote).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fuel-recon-manual-match-honest";
const PAGE = "apps/frontend/src/pages/reports/FuelReconciliationPage.tsx";

function assertHonest(src) {
  const errors = [];
  // Prefer the button whose children are exactly "Save link" (ignore prose mentions).
  const buttonMatch = src.match(/<Button\b([\s\S]*?)>\s*Save link\s*<\/Button>/);
  if (!buttonMatch) {
    errors.push(`${PAGE}: missing Save link <Button>`);
    return errors;
  }
  const buttonJsx = `<Button${buttonMatch[1]}>Save link</Button>`;

  const disabled = /\bdisabled\b/.test(buttonJsx);
  const hasOnClick = /onClick\s*=/.test(buttonJsx);
  const mutationRe = /\b(mutate|apiRequest|rematch|manualMatch|postManual|fetch)\w*/i;
  const noopOnly =
    /setMatchOpen\s*\(\s*false\s*\)/.test(buttonJsx)
    && /setMatchNote\s*\(\s*["']["']\s*\)/.test(buttonJsx)
    && !mutationRe.test(buttonJsx);

  if (disabled) {
    if (!/\btitle\s*=/.test(buttonJsx) && !/\baria-disabled\b/.test(buttonJsx)) {
      errors.push(`${PAGE}: disabled Save link must expose title or aria-disabled honesty`);
    }
    if (hasOnClick && noopOnly) {
      errors.push(`${PAGE}: disabled Save link must not keep a noop onClick that fakes success`);
    }
    return errors;
  }

  if (!hasOnClick) {
    errors.push(`${PAGE}: enabled Save link must have onClick wired to a mutation`);
    return errors;
  }
  if (noopOnly || !mutationRe.test(buttonJsx)) {
    errors.push(`${PAGE}: Save link onClick must call a mutation (not only setMatchOpen/setMatchNote)`);
  }
  return errors;
}

function selftest() {
  const honestDisabled = `
    <Button disabled title="not available yet" aria-disabled="true">
      Save link
    </Button>
  `;
  const noop = `
    <Button
      onClick={() => {
        setMatchOpen(false);
        setMatchNote("");
      }}
    >
      Save link
    </Button>
  `;
  const wired = `
    <Button
      onClick={() => {
        void postManualMatch({ note: matchNote }).then(() => setMatchOpen(false));
      }}
    >
      Save link
    </Button>
  `;
  if (assertHonest(honestDisabled).length) {
    console.error(`${LABEL} SELFTEST FAILED — disabled honest fixture rejected`);
    process.exit(1);
  }
  if (!assertHonest(noop).some((e) => e.includes("mutation"))) {
    console.error(`${LABEL} SELFTEST FAILED — noop not caught`);
    process.exit(1);
  }
  if (assertHonest(wired).length) {
    console.error(`${LABEL} SELFTEST FAILED — wired mutation fixture rejected`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
const errors = assertHonest(src);
if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Save link is honest (disabled or mutation-wired)`);
process.exit(0);
