#!/usr/bin/env node
/**
 * verify-help-feedback-persisted.mjs — 0441-mod11-help-was-this-helpful-not-persisted
 *
 * HelpArticlePage "Was this helpful?" must persist Yes/No to localStorage keyed by
 * article id/slug (`help_feedback:<id>`), restore on mount. Frontend-only — no
 * new backend Help routes.
 *
 * Self-test: node scripts/verify-help-feedback-persisted.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-help-feedback-persisted";
const PAGE = "apps/frontend/src/pages/help/HelpArticlePage.tsx";

/**
 * @param {string} source
 * @returns {string[]}
 */
export function computeFailures(source) {
  const errors = [];
  if (!/help_feedback:/.test(source)) {
    errors.push(`${PAGE}: must use localStorage key prefix help_feedback:<id>`);
  }
  if (!/localStorage\.getItem/.test(source) && !/window\.localStorage\.getItem/.test(source)) {
    errors.push(`${PAGE}: must restore feedback via localStorage.getItem`);
  }
  if (!/localStorage\.setItem/.test(source) && !/window\.localStorage\.setItem/.test(source)) {
    errors.push(`${PAGE}: must persist feedback via localStorage.setItem`);
  }
  if (!/function writeHelpFeedback[\s\S]{0,500}: boolean[\s\S]{0,500}return true[\s\S]{0,500}return false/.test(source)) {
    errors.push(`${PAGE}: persistence helper must report success/failure`);
  }
  if (!/if \(writeHelpFeedback\([\s\S]{0,200}\)\)[\s\S]{0,200}setFeedback/.test(source)) {
    errors.push(`${PAGE}: UI must acknowledge feedback only after persistence succeeds`);
  }
  if (!/role="alert"[\s\S]{0,200}\{feedbackError\}/.test(source)) {
    errors.push(`${PAGE}: blocked storage must render an accessible failure`);
  }
  // Lazy init and/or effect restore — either form is fine; both count as restore-on-mount.
  const restoresOnMount =
    /useState\s*<[^>]*>\s*\(\s*\(\s*\)\s*=>/.test(source) ||
    /useState\s*\(\s*\(\s*\)\s*=>\s*readHelpFeedback/.test(source) ||
    /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{[^}]*setFeedback\s*\(\s*readHelpFeedback/.test(source) ||
    /useEffect[\s\S]{0,400}readHelpFeedback/.test(source);
  if (!restoresOnMount) {
    errors.push(`${PAGE}: must restore persisted feedback on mount (lazy useState and/or useEffect)`);
  }
  if (/fetch\s*\(\s*['"`][^'"`]*\/api\/v1\/help/.test(source) || /\/api\/v1\/help\//.test(source)) {
    errors.push(`${PAGE}: must NOT call backend Help routes (HELP is frontend-only)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { useEffect, useState } from "react";
    function helpFeedbackStorageKey(id) { return \`help_feedback:\${id}\`; }
    function readHelpFeedback(id) {
      return window.localStorage.getItem(helpFeedbackStorageKey(id));
    }
    function writeHelpFeedback(id, v): boolean {
      try {
        window.localStorage.setItem(helpFeedbackStorageKey(id), v);
        return true;
      } catch {
        return false;
      }
    }
    export function HelpArticlePage() {
      const [feedback, setFeedback] = useState(() => readHelpFeedback(slug));
      useEffect(() => { setFeedback(readHelpFeedback(slug)); }, [slug]);
      const [feedbackError, setFeedbackError] = useState(null);
      const choose = (v) => { if (writeHelpFeedback(slug, v)) setFeedback(v); else setFeedbackError("Could not save"); };
      return <><button onClick={() => choose("up")}>Yes</button><p role="alert">{feedbackError}</p></>;
    }
  `;
  const bad = `
    import { useState } from "react";
    export function HelpArticlePage() {
      const [feedback, setFeedback] = useState(null);
      return <button onClick={() => setFeedback("up")}>Yes</button>;
    }
  `;
  const badApi = `
    import { useState } from "react";
    function helpFeedbackStorageKey(id) { return \`help_feedback:\${id}\`; }
    export function HelpArticlePage() {
      const [feedback, setFeedback] = useState(() => window.localStorage.getItem(helpFeedbackStorageKey(slug)));
      fetch("/api/v1/help/feedback");
      return null;
    }
  `;
  let ok = true;
  for (const c of [
    { name: "persisted", input: good, expectPass: true },
    { name: "useState only", input: bad, expectPass: false },
    { name: "backend Help route", input: badApi, expectPass: false },
  ]) {
    const failures = computeFailures(c.input);
    const passed = failures.length === 0;
    if (passed !== c.expectPass) {
      ok = false;
      console.error(`SELFTEST FAIL — ${c.name}: ${JSON.stringify(failures)}`);
    } else {
      console.log(`selftest ok — ${c.name}`);
    }
  }
  if (!ok) process.exit(1);
  console.log(`${LABEL} --selftest OK`);
}

function run() {
  const source = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const failures = computeFailures(source);
  if (failures.length) {
    console.error(`[${LABEL}] FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — Help feedback persists to localStorage (help_feedback:<id>)`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
