#!/usr/bin/env node
import fs from "node:fs";

const source = fs.readFileSync("apps/frontend/src/pages/docs/DocsHomePage.tsx", "utf8");
for (const token of [
  "getDocsFoundationDetail",
  'data-testid="docs-file-preview-link"',
  "onClick={() => onPreview(row.id)}",
  "<PreviewModal",
  'title="Couldn\'t open document"',
]) {
  if (!source.includes(token)) throw new Error(`docs preview linkage guard: missing ${token}`);
}

console.log("verify-docs-foundation-preview-link: PASS");
