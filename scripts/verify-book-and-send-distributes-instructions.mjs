#!/usr/bin/env node
// BOOK-AND-SEND guard (owner order 2026-09-04, item 5 "enable Book and send"): the Book Load split
// control's "Book and send" must be ENABLED and wired to the real driver-instruction distribution
// endpoint — not left as the WIZ-49d disabled placeholder. It books + dispatches, then sends the
// no-pay driver instruction sheet to the driver (distributeLoadInstructions →
// POST /dispatch/loads/:id/distribute-instructions).
//
// Usage: node scripts/verify-book-and-send-distributes-instructions.mjs [--selftest]

import { readFileSync } from "node:fs";

const MODAL = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";

function audit(src) {
  const f = [];
  // Must import + call the real distribution client.
  if (!/import \{[^}]*distributeLoadInstructions[^}]*\} from "\.\.\/\.\.\/\.\.\/api\/dispatch"/.test(src))
    f.push(`${MODAL}: must import distributeLoadInstructions from api/dispatch`);
  if (!/await distributeLoadInstructions\(loadId, operatingCompanyId\)/.test(src))
    f.push(`${MODAL}: sendDriverInstructions must call distributeLoadInstructions(loadId, operatingCompanyId)`);
  // "Book and send" must be wired (onSaveAndSend), not the disabled placeholder.
  if (!/onSaveAndSend=/.test(src))
    f.push(`${MODAL}: the SaveDropdown must receive onSaveAndSend (Book and send enabled)`);
  if (/saveAndSendDisabledReason=/.test(src))
    f.push(`${MODAL}: the WIZ-49d saveAndSendDisabledReason placeholder must be removed — Book and send is enabled`);
  // The post-save intent must handle "send".
  if (!/if \(intent === "send"\)/.test(src))
    f.push(`${MODAL}: applyPostSaveIntent must handle the "send" intent`);
  return f;
}

function main() {
  const selftest = process.argv.includes("--selftest");
  const src = readFileSync(MODAL, "utf8");

  const failures = audit(src);
  if (failures.length) {
    console.error("FAIL verify-book-and-send-distributes-instructions:");
    for (const x of failures) console.error(`  - ${x}`);
    process.exit(1);
  }

  if (selftest) {
    const mut1 = src.replace(/onSaveAndSend=/, "xSaveAndSend=");
    if (audit(mut1).length === 0) {
      console.error("SELFTEST FAIL: removing onSaveAndSend did not trip the guard");
      process.exit(1);
    }
    const mut2 = src.replace(/await distributeLoadInstructions\(loadId, operatingCompanyId\)/, "await noop()");
    if (audit(mut2).length === 0) {
      console.error("SELFTEST FAIL: removing the distribute call did not trip the guard");
      process.exit(1);
    }
    console.log("SELFTEST OK: guard trips on both mutations");
  }

  console.log("PASS verify-book-and-send-distributes-instructions");
}

main();
