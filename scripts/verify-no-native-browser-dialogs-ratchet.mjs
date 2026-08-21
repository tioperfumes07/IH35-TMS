#!/usr/bin/env node
/**
 * GUARD: no NEW native window.confirm() / window.alert() / window.prompt() call sites in the frontend.
 *
 * WHY THIS EXISTS (measured 2026-08-21, not theorised):
 * A native JS dialog suspends the page's event loop until a human clicks it. Anthropic's own Chrome
 * automation docs say it plainly: "JavaScript dialogs block browser events and prevent Claude from
 * receiving commands." So the moment a coder agent running the Live Chrome gate clicks Void, Deactivate,
 * Revoke, Dismiss or Disconnect, the extension goes deaf and every later browser command times out —
 * until a person physically walks over and clicks OK. That is not a Render outage and not an API
 * outage; on 2026-08-21 the API was measured healthy (33/35 home calls 200, slowest 700ms, 100/100
 * concurrent health probes OK, zero 5xx in 90 minutes) while coders were blocked on exactly this.
 *
 * It is also an accounting-integrity defect independent of automation. window.prompt() is how several
 * money surfaces currently capture a VOID REASON and a DEACTIVATION REASON: no validation, no character
 * counter, no field labelling, and null-vs-empty-string ambiguity on cancel. A void reason captured
 * through a native prompt is not a defensible audit artifact.
 *
 * The replacements already exist and say so in their own doc comments:
 *   apps/frontend/src/components/shared/ConfirmModal.tsx      "replaces native window.confirm()"
 *   apps/frontend/src/components/accounting/VoidReasonModal.tsx "replaces native window.prompt()/confirm() on money"
 * The components were built; the migration stalled. This guard stops the backlog from growing while it
 * is worked down.
 *
 * RATCHET, not a hard gate: main currently carries a known number of call sites. Failing closed on all
 * of them would block every merge, so this asserts the count may only ever go DOWN. Adding a new native
 * dialog fails; removing one and forgetting to lower the baseline also fails, so the baseline can never
 * drift upward silently.
 *
 * Usage:  node scripts/verify-no-native-browser-dialogs-ratchet.mjs
 *         node scripts/verify-no-native-browser-dialogs-ratchet.mjs --selftest
 *         node scripts/verify-no-native-browser-dialogs-ratchet.mjs --print   (list every site)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-no-native-browser-dialogs-ratchet";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps", "frontend", "src");

/** Baseline = the count on main when this guard landed (measured, comments and strings excluded). May only go DOWN. */
const BASELINE = 13;

const DIALOG_RE = /(?:^|[^.\w$])window\s*\.\s*(confirm|alert|prompt)\s*\(/g;

/** Strip // line comments, block comments and string/template literals so only real code is matched. */
export function stripNonCode(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  let mode = "code";
  let quote = "";
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (mode === "code") {
      if (c === "/" && c2 === "/") { mode = "line"; i += 2; continue; }
      if (c === "/" && c2 === "*") { mode = "block"; i += 2; continue; }
      if (c === '"' || c === "'" || c === "`") { mode = "str"; quote = c; out += " "; i += 1; continue; }
      out += c; i += 1; continue;
    }
    if (mode === "line") { if (c === "\n") { mode = "code"; out += "\n"; } i += 1; continue; }
    if (mode === "block") { if (c === "*" && c2 === "/") { mode = "code"; i += 2; continue; } if (c === "\n") out += "\n"; i += 1; continue; }
    // string
    if (c === "\\") { i += 2; continue; }
    if (c === quote) { mode = "code"; quote = ""; }
    if (c === "\n") out += "\n";
    i += 1;
  }
  return out;
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__" || entry.name === "generated") continue;
      walk(full, acc);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) continue;
    acc.push(full);
  }
  return acc;
}

export function findDialogSites(files, read = (f) => fs.readFileSync(f, "utf8")) {
  const sites = [];
  for (const file of files) {
    const code = stripNonCode(read(file));
    const lines = code.split(/\r?\n/);
    lines.forEach((line, idx) => {
      DIALOG_RE.lastIndex = 0;
      let m;
      while ((m = DIALOG_RE.exec(line)) !== null) {
        sites.push({ file: path.relative(ROOT, file), line: idx + 1, kind: m[1] });
      }
    });
  }
  return sites;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const FAKE = "/fake/Page.tsx";

  // 1. A real call site must be caught.
  let sites = findDialogSites([FAKE], () => `const ok = window.confirm("Void this bill?");`);
  if (sites.length !== 1 || sites[0].kind !== "confirm") failures.push("selftest 1: real window.confirm() not caught");

  // 2. THE REGRESSION SHAPE — the doc comment in ConfirmModal.tsx that says it "replaces native
  //    window.confirm()". A naive grep counts that as a call site and the guard becomes noise.
  sites = findDialogSites([FAKE], () => `/** In-app yes/no confirmation — replaces native window.confirm() on destructive actions. */\nexport function ConfirmModal() {}`);
  if (sites.length !== 0) failures.push("selftest 2: comment mentioning window.confirm() falsely counted as a call site");

  // 3. A string that merely names the API must not count either.
  sites = findDialogSites([FAKE], () => `const msg = "do not use window.prompt() here";`);
  if (sites.length !== 0) failures.push("selftest 3: string mentioning window.prompt() falsely counted");

  // 4. A method named confirm on some other object is not a native dialog.
  sites = findDialogSites([FAKE], () => `await dialogService.confirm("really?");`);
  if (sites.length !== 0) failures.push("selftest 4: unrelated .confirm() falsely counted");

  // 5. All three kinds are detected.
  sites = findDialogSites([FAKE], () => `window.alert(a);\nwindow.prompt(b);\nwindow.confirm(c);`);
  if (sites.length !== 3) failures.push(`selftest 5: expected 3 kinds, got ${sites.length}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK — planted defects caught, comment/string/other-object false positives refused`);
  process.exit(0);
}

const sites = findDialogSites(walk(SRC));

if (process.argv.includes("--print")) {
  for (const s of sites) console.log(`${s.file}:${s.line}  window.${s.kind}()`);
}

if (sites.length > BASELINE) {
  const byFile = new Map();
  for (const s of sites) byFile.set(s.file, (byFile.get(s.file) ?? 0) + 1);
  console.error(
    `${LABEL} FAILED — ${sites.length} native window.confirm/alert/prompt call site(s), baseline is ${BASELINE}. ` +
      `A native dialog freezes the page's event loop and makes the Chrome extension stop responding to every ` +
      `later command, which blocks Live Chrome verification until a human clicks the dialog by hand. ` +
      `Use apps/frontend/src/components/shared/ConfirmModal.tsx for yes/no, or ` +
      `apps/frontend/src/components/accounting/VoidReasonModal.tsx when a reason string must be captured ` +
      `(a void/deactivation reason taken through window.prompt has no validation and is not an audit artifact).`,
  );
  for (const [file, n] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.error(`  ${n}  ${file}`);
  process.exit(1);
}

if (sites.length < BASELINE) {
  console.error(
    `${LABEL} FAILED — ${sites.length} call site(s) remain but BASELINE is still ${BASELINE}. ` +
      `You removed ${BASELINE - sites.length}; lower BASELINE to ${sites.length} in this file so the ratchet ` +
      `cannot drift back up. This is the good failure.`,
  );
  process.exit(1);
}

console.log(`${LABEL} OK — ${sites.length} native dialog call site(s), at baseline ${BASELINE}, none added`);
