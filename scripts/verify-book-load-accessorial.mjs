#!/usr/bin/env node
/**
 * Block B21-D3: Book Load accessorial editor wired (+ Create charge, not dead + Add).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  editor: path.join(ROOT, "apps/frontend/src/components/dispatch/AccessorialEditor.tsx"),
  bookLoad: path.join(ROOT, "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx"),
  lib: path.join(ROOT, "apps/frontend/src/components/dispatch/accessorial-editor-lib.ts"),
  backend: path.join(ROOT, "apps/backend/src/dispatch/book-load-accessorial.ts"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`verify:book-load-accessorial FAIL: ${msg}`);
  process.exit(1);
}

function main() {
  const editor = read(paths.editor);
  const bookLoad = read(paths.bookLoad);
  const lib = read(paths.lib);
  const backend = read(paths.backend);
  const archDesign = read(paths.archDesign);
  const failures = [];

  if (!editor.includes("+ Create charge")) {
    failures.push("AccessorialEditor must expose + Create charge CTA");
  }
  if (!bookLoad.includes("AccessorialEditor")) {
    failures.push("BookLoadModalV4 must mount AccessorialEditor");
  }
  if (!bookLoad.includes("ARCHIVE-not-DELETE")) {
    failures.push("BookLoadModalV4 must retain ARCHIVE-not-DELETE (B21-D3) comment");
  }
  if (!lib.includes("buildBookLoadChargeLines")) {
    failures.push("accessorial-editor-lib must build book load charge lines");
  }
  if (!backend.includes("accessorial")) {
    failures.push("book-load-accessorial backend helper must exist");
  }
  if (!archDesign.includes("verify:book-load-accessorial")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:book-load-accessorial");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  console.log("verify:book-load-accessorial PASS");
}

main();
