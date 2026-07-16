#!/usr/bin/env node
/**
 * UI-HONESTY guard (audit gap #15) — Banking "for review" grid must not ship pretend actions.
 *
 * Two regressions this locks out of BankingTransactionsDesignView.tsx:
 *   1. Bulk "Categorize" action that only fires a toast ("coming soon"/"coming next") — a fake stub with
 *      no backend call and no honest `disabled`. It MUST either call the real bulk-categorize API
 *      (categorizeTransactionsBulk → POST /banking/transactions/categorize-bulk) or be `disabled:` with a
 *      reason. No pretend success/"coming later" toast.
 *   2. A dead <Paperclip/> (attachment) control rendered with no onClick handler AND not `disabled`. Bank
 *      transactions are not a supported attachments entity_type, so the control must be honestly disabled
 *      (kept visible per never-delete law), never an inert decoration masquerading as clickable.
 *
 * Do NOT "fix" by deleting the control or faking a success — that violates the fix-not-patch law.
 *
 * --selftest exercises assertGuard() against inline fixtures (pass + violation).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-banking-categorize-ux-honesty";
const TARGET = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";

/** Extract the opening tag `<button ...>` that most immediately encloses the given index. */
function enclosingButtonTag(src, iconIndex) {
  const open = src.lastIndexOf("<button", iconIndex);
  if (open === -1) return null;
  const gt = src.indexOf(">", open);
  if (gt === -1 || gt > iconIndex) return null; // malformed or icon before the button closes
  return src.slice(open, gt + 1);
}

const DISABLED_PROP = /\bdisabled(?:\s|=|\/|>)/;
const ONCLICK_PROP = /\bonClick=/;
/** Pretend bulk-categorize: a toast-only handler promising a future feature. */
const FAKE_COMING = /coming\s+(?:soon|next|later)/i;

export function assertGuard({ file, source }) {
  const errors = [];

  // ── Check 1: bulk "Categorize" action must be real or honestly disabled ──────────────────────────────
  // Find the bulk action object literal `{ id: "categorize", ... }` (brace-balanced).
  const idMatch = source.match(/\{\s*id:\s*["']categorize["']/);
  if (idMatch) {
    const start = idMatch.index;
    let depth = 0;
    let end = start;
    for (let i = start; i < source.length; i += 1) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    const block = source.slice(start, end);
    const isDisabled = /disabled:\s*(?:true|[A-Za-z0-9_.!]+[^,}]*)/.test(block);
    const callsRealApi = /categorizeTransactionsBulk|openBulkCategorize|setBulkCategorizeOpen/.test(block);
    const fakeToastOnly =
      FAKE_COMING.test(block) || (/pushToast\(/.test(block) && !callsRealApi && !isDisabled);
    if (fakeToastOnly) {
      errors.push(
        `${file}: bulk "Categorize" action is a fake stub (toast-only / "coming soon") — wire it to the real ` +
          `categorizeTransactionsBulk API or mark it disabled: with an honest reason.`
      );
    }
  }

  // ── Check 2: every <Paperclip/> must be wired (onClick) or honestly disabled ─────────────────────────
  const paperclipRe = /<Paperclip\b/g;
  let m;
  while ((m = paperclipRe.exec(source))) {
    const btn = enclosingButtonTag(source, m.index);
    const wiredButton = btn && (DISABLED_PROP.test(btn) || ONCLICK_PROP.test(btn));
    if (!wiredButton) {
      errors.push(
        `${file}: dead <Paperclip/> attachment control — it is neither inside a disabled button nor a ` +
          `button with an onClick. Honestly disable it (bank transactions have no attachments flow) — ` +
          `do not leave an inert decoration nor delete the control.`
      );
    }
  }

  return errors;
}

function selftest() {
  const cases = [
    {
      n: "real wired bulk categorize + disabled paperclip → 0",
      file: "Fixture.tsx",
      src:
        `const a=[{ id: "categorize", label: "Categorize", disabled: tab !== "for_review", onClick: () => openBulkCategorize() }];\n` +
        `<button type="button" disabled title="x"><Paperclip className="h-4 w-4" /></button>`,
      want: 0,
    },
    {
      n: "fake toast-only bulk categorize → 1",
      file: "Fixture.tsx",
      src: `const a=[{ id: "categorize", label: "Categorize", onClick: () => pushToast("coming next", "info") }];`,
      want: 1,
    },
    {
      n: "bare decorative paperclip (no button/handler) → 1",
      file: "Fixture.tsx",
      src: `<div className="icons"><Paperclip className="h-4 w-4" /></div>`,
      want: 1,
    },
    {
      n: "paperclip inside a button WITH onClick → 0",
      file: "Fixture.tsx",
      src: `<button type="button" onClick={() => openAttach()}><Paperclip className="h-4 w-4" /></button>`,
      want: 0,
    },
    {
      n: "bulk categorize wired via setBulkCategorizeOpen → 0",
      file: "Fixture.tsx",
      src: `const a=[{ id: "categorize", label: "Categorize", onClick: () => setBulkCategorizeOpen(true) }];`,
      want: 0,
    },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = assertGuard({ file: c.file, source: c.src }).length;
    const ok = n === c.want;
    if (!ok) failed += 1;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (errors=${n}, want=${c.want})`);
  }
  if (failed) {
    console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`);
    process.exit(1);
  }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const abs = path.join(ROOT, TARGET);
if (!fs.existsSync(abs)) {
  console.error(`[${LABEL}] FAILED — target file not found: ${TARGET}`);
  process.exit(1);
}
const source = fs.readFileSync(abs, "utf8");
const errors = assertGuard({ file: TARGET, source });

if (errors.length > 0) {
  console.error(`[${LABEL}] FAILED — ${errors.length} banking categorize/attachment honesty violation(s).`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — bulk Categorize is wired/honestly-disabled and no dead <Paperclip/> control.`);
