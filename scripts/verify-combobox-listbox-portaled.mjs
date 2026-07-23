#!/usr/bin/env node
/**
 * Combobox listbox must portal to document.body (fixed), not nest as absolute inside
 * overflow-hidden / overflow-x-auto ancestors (ParityTable).
 *
 * Live defect (post #3342): CoA Roles fetched accounts correctly, but clicking
 * "Select account…" showed no list — the dropdown was clipped to the table cell height.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FILE = "apps/frontend/src/components/Combobox.tsx";

export function run(root = ROOT) {
  const failures = [];
  const src = fs.readFileSync(path.join(root, FILE), "utf8");

  if (!/from ["']react-dom["']/.test(src) || !/createPortal/.test(src)) {
    failures.push(`${FILE}: listbox must use createPortal from react-dom`);
  }
  if (!/data-combobox-listbox=["']portal["']/.test(src)) {
    failures.push(`${FILE}: listbox must mark data-combobox-listbox="portal"`);
  }
  if (!/position:\s*["']fixed["']/.test(src) && !/position:\s*"fixed"/.test(src)) {
    // measureListboxStyle returns position: "fixed"
    if (!/position:\s*"fixed"/.test(src)) {
      failures.push(`${FILE}: portaled listbox must use position fixed (escape overflow clipping)`);
    }
  }
  // Bug shape: absolute listbox still mounted inside the anchor (clipped by ParityTable).
  if (/role=["']listbox["'][\s\S]*className=["'][^"']*absolute/.test(src)) {
    failures.push(`${FILE}: absolute listbox inside the combobox root is the ParityTable-clip bug`);
  }
  if (/className=["'][^"']*absolute z-20[^"']*["'][\s\S]*role=["']listbox["']/.test(src)) {
    failures.push(`${FILE}: absolute z-20 listbox is the clipped-dropdown bug shape`);
  }

  return failures;
}

function selftest() {
  const tmp = fs.mkdtempSync("/tmp/verify-combobox-portal-");
  const rel = FILE;
  fs.mkdirSync(path.join(tmp, path.dirname(rel)), { recursive: true });

  fs.writeFileSync(
    path.join(tmp, rel),
    `
export function Combobox() {
  return (
    <div className="relative">
      <input role="combobox" />
      {open ? (
        <div id={listboxId} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto">
          options
        </div>
      ) : null}
    </div>
  );
}
`,
  );
  if (!run(tmp).length) throw new Error("selftest: absolute listbox must FAIL");

  fs.writeFileSync(
    path.join(tmp, rel),
    `
import { createPortal } from "react-dom";
function measure() {
  return { position: "fixed", top: 0, left: 0, zIndex: 80 };
}
export function Combobox() {
  return (
    <div>
      <input role="combobox" />
      {createPortal(
        <div role="listbox" data-combobox-listbox="portal" style={{ position: "fixed" }}>
          options
        </div>,
        document.body,
      )}
    </div>
  );
}
`,
  );
  const good = run(tmp);
  if (good.length) throw new Error("selftest: portal shape must PASS: " + good.join("; "));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-combobox-listbox-portaled --selftest OK");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else {
    const f = run();
    if (f.length) {
      console.error(f.join("\n"));
      process.exit(1);
    }
    console.log("verify-combobox-listbox-portaled — OK");
  }
}
