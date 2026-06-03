#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const FRONTEND_ROOT = path.join(ROOT, "apps/frontend/src");

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (/Modal\.tsx$/.test(entry.name)) out.push(p);
  }
  return out;
}

function isReExportOnly(source) {
  if (/export\s+function\s+/.test(source)) return false;
  if (/export\s+default\s+function/.test(source)) return false;
  return /^export\s+\{[^}]+\}\s+from\s+["'][^"']+["'];?\s*$/m.test(source.trim());
}

function hasModalNoX(source) {
  return /\/\/\s*@ModalNoX\b/.test(source);
}

function hasXCloseContract(source) {
  if (/<InvoiceTypeModalBase[\s/>]/.test(source)) {
    return true;
  }
  if (/<Modal[\s/>]/.test(source) && /from\s+["'][^"']*\/Modal["']/.test(source)) {
    return true;
  }
  if (/ModalCloseButton/.test(source)) {
    return true;
  }
  if (/aria-label=\{[^}]*modalCloseAriaLabel/.test(source)) {
    return true;
  }
  if (/aria-label=["'`]Close\s/.test(source)) {
    return true;
  }
  if (/aria-label=\{`Close\s\$\{/.test(source) || /aria-label=\{modalCloseAriaLabel/.test(source)) {
    return true;
  }
  return false;
}

const violations = [];
const inventory = [];
const exempt = [];

for (const file of walk(FRONTEND_ROOT)) {
  const rel = path.relative(ROOT, file);
  if (rel.endsWith("components/Modal.tsx")) continue;

  const source = fs.readFileSync(file, "utf8");
  inventory.push(rel);

  if (isReExportOnly(source)) continue;
  if (hasModalNoX(source)) {
    exempt.push(rel);
    continue;
  }
  if (!hasXCloseContract(source)) {
    violations.push(`${rel}: missing shared Modal, ModalCloseButton, or aria-label starting with "Close"`);
  }
}

if (violations.length > 0) {
  console.error("verify:all-modals-have-x-close FAIL");
  for (const v of violations) console.error(`- ${v}`);
  process.exit(1);
}

console.log(`verify:all-modals-have-x-close PASS (${inventory.length} Modal.tsx files, ${exempt.length} @ModalNoX exempt)`);
