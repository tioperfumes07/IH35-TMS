#!/usr/bin/env node
/**
 * LV-DOCS-SOFT-DELETE-DESTRUCTIVE-COPY
 * SoftDeleteModal must not present recoverable void as hard Delete / Soft Delete.
 * Required chrome: Archive title + Archive submit + recoverable retention copy.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODAL = path.join(ROOT, "apps/frontend/src/components/documents/SoftDeleteModal.tsx");
const TAB = path.join(ROOT, "apps/frontend/src/components/documents/DocumentsTab.tsx");

function fail(msg) {
  console.error(`FAIL verify-docs-soft-delete-recoverable-copy: ${msg}`);
  process.exit(1);
}

/** Strip block/line comments so finding prose does not false-positive. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function assertModalChrome(label, src) {
  const code = stripComments(src);
  if (/title=["']Soft Delete/.test(code)) {
    fail(`${label}: Modal title still Soft Delete`);
  }
  if (/You are deleting/.test(code)) {
    fail(`${label}: body still says "You are deleting"`);
  }
  if (!/title=["']Archive Document["']/.test(code)) {
    fail(`${label}: missing Modal title="Archive Document"`);
  }
  if (!/>\s*Archive\s*</.test(code)) {
    fail(`${label}: missing Archive submit button label`);
  }
  if (!/recoverable/i.test(code)) {
    fail(`${label}: missing recoverable retention wording`);
  }
  if (/variant=["']danger["'][\s\S]{0,120}>\s*Delete\s*</.test(code)) {
    fail(`${label}: danger submit still labeled Delete`);
  }
}

function assertTabChrome(label, src) {
  const code = stripComments(src);
  if (/>\s*Soft Delete\s*</.test(code)) {
    fail(`${label}: row action still labeled Soft Delete — use Archive`);
  }
  if (!/>\s*Archive\s*</.test(code)) {
    fail(`${label}: missing Archive row action for soft-delete path`);
  }
}

function main() {
  assertModalChrome("SoftDeleteModal.tsx", fs.readFileSync(MODAL, "utf8"));
  assertTabChrome("DocumentsTab.tsx", fs.readFileSync(TAB, "utf8"));
  console.log("OK verify-docs-soft-delete-recoverable-copy — Archive chrome + recoverable copy");
}

function selftest() {
  const bad = `title="Soft Delete Document"\nYou are deleting x\n<button variant="danger">Delete</button>`;
  let failed = false;
  const origExit = process.exit;
  process.exit = (code) => {
    failed = code === 1;
    throw new Error("exit");
  };
  try {
    assertModalChrome("selftest-bad", bad);
  } catch {
    /* expected */
  }
  process.exit = origExit;
  if (!failed) fail("selftest: bad Soft Delete fixture did not fail");

  const ok = `title="Archive Document"\nArchive file? recoverable retention\n<button>Archive</button>`;
  assertModalChrome("selftest-ok", ok);

  const modal = fs.readFileSync(MODAL, "utf8");
  const poisoned = stripComments(modal).replace(/Archive Document/g, "Soft Delete Document");
  failed = false;
  process.exit = (code) => {
    failed = code === 1;
    throw new Error("exit");
  };
  try {
    assertModalChrome("selftest-poison", poisoned);
  } catch {
    /* expected */
  }
  process.exit = origExit;
  if (!failed) fail("selftest: poisoned Soft Delete title did not fail");

  console.log("OK verify-docs-soft-delete-recoverable-copy --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else main();
