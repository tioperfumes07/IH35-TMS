#!/usr/bin/env node
/**
 * FAIL-D2 ratchet — Book/Edit Load must never fail silently.
 *
 * `form.handleSubmit(onValid)` called WITHOUT an onInvalid handler aborts without a toast, a banner,
 * or a console line, and `submitLoad` never runs. In EDIT mode that is invisible by construction:
 * most sections render `isEditMode ? null : …`, so an invalid field's inline error has nowhere on
 * screen to appear and "Save changes" reads as a dead button — the dispatcher believes the rate
 * change saved when nothing was written.
 *
 * Five separate controls funnel into this form's submit. Guarding the ones that exist today is not
 * enough; this guard fails the build the moment a SIXTH is added without the invalid handler.
 *
 * Static only — no DB, no network, no build. Runs in well under a second.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";
const HANDLER = "onInvalidSubmit";

const src = readFileSync(join(repoRoot, TARGET), "utf8");
const failures = [];

// 1. The single invalid handler must exist and must actually surface something to the user.
if (!new RegExp(`const\\s+${HANDLER}\\s*=`).test(src)) {
  failures.push(`${TARGET}: no \`${HANDLER}\` handler — a failed validation would abort silently.`);
} else {
  const body = src.slice(src.indexOf(`const ${HANDLER}`), src.indexOf(`const ${HANDLER}`) + 1400);
  if (!/setSubmitErrorMessage\s*\(/.test(body)) {
    failures.push(`${TARGET}: \`${HANDLER}\` does not call setSubmitErrorMessage — no on-screen banner.`);
  }
  if (!/pushToast\s*\(/.test(body)) {
    failures.push(`${TARGET}: \`${HANDLER}\` does not call pushToast — no toast on a blocked save.`);
  }
}

// 2. EVERY handleSubmit call site must pass it. Walk from each call and match parens to find the
//    argument list, so a multi-line async callback does not defeat the check.
//    Comments are blanked (newlines preserved, so offsets and line numbers stay exact) — this file
//    documents the pattern in prose, and prose is not a call site.
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));

let idx = 0;
let sites = 0;
while ((idx = code.indexOf("form.handleSubmit(", idx)) !== -1) {
  const open = idx + "form.handleSubmit(".length - 1;
  let depth = 0;
  let end = -1;
  for (let i = open; i < code.length; i += 1) {
    const ch = code[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) break;
  sites += 1;
  const args = code.slice(open + 1, end);
  if (!args.includes(HANDLER)) {
    const line = code.slice(0, idx).split("\n").length;
    failures.push(`${TARGET}:${line}: form.handleSubmit(...) has no \`${HANDLER}\` — this control fails silently.`);
  }
  idx = end;
}

if (sites === 0) {
  failures.push(`${TARGET}: no form.handleSubmit call sites found — guard is stale, re-point it.`);
}

if (failures.length > 0) {
  console.error("FAIL verify-book-load-submit-not-silent");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`PASS verify-book-load-submit-not-silent — ${sites} submit control(s), all explain a blocked save`);
