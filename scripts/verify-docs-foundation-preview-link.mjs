#!/usr/bin/env node
/**
 * Docs Foundation preview linkage — DocsHomePage.tsx's file roster must actually open a real
 * document preview when clicked, not dead-end.
 *
 * 2026-08-21 (CC-3): the original check required a literal `onClick={() => onPreview(row.id)}`
 * handler on the file link. That handler was since replaced by a deep-linkable, better-architected
 * pattern: the file column renders a real `EntityLink kind="document"`, which the shared registry
 * (components/shared/EntityLink.tsx) resolves to `/docs?file_id=${id}` — a shareable URL, not just
 * an imperative click callback. DocsHomePage.tsx reads that `file_id` query param back into
 * `previewFileId` state, which drives the same `getDocsFoundationDetail` query and the same
 * `<PreviewModal>` as before. The literal-string check went stale on a genuine upgrade; re-anchored
 * to the real current wiring (EntityLink kind + searchParams-driven previewFileId), same intent.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-docs-foundation-preview-link";
const FILE = "apps/frontend/src/pages/docs/DocsHomePage.tsx";

const CHECKS = [
  { label: "real docs-foundation detail fetch", token: "getDocsFoundationDetail" },
  { label: "real file-preview link test id", token: 'data-testid="docs-file-preview-link"' },
  { label: "real EntityLink document kind driving the preview link", token: 'kind="document"' },
  { label: "previewFileId sourced from the shareable file_id query param", token: 'searchParams.get("file_id")' },
  { label: "real PreviewModal mount", token: "<PreviewModal" },
  { label: "honest error title on preview failure", token: "title=\"Couldn't open document\"" },
];

function runChecks(root = ROOT) {
  const abs = path.join(root, FILE);
  if (!fs.existsSync(abs)) return [`${FILE}: missing`];
  const src = fs.readFileSync(abs, "utf8");
  return CHECKS.filter((c) => !src.includes(c.token)).map((c) => `${c.label}: missing "${c.token}"`);
}

function selftest() {
  const live = runChecks();
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAIL — clean tree already red:\n${live.map((e) => `  ✗ ${e}`).join("\n")}`);
    process.exit(1);
  }
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".docs-foundation-preview-selftest-"));
  try {
    const abs = path.join(tmp, FILE);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, "// poison — no preview linkage\n");
    const planted = runChecks(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL — planted misses not all caught (${planted.length}/${CHECKS.length})`);
      process.exit(1);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`${LABEL} SELFTEST PASS (poison trips ${CHECKS.length}/${CHECKS.length})`);
}

if (process.argv.includes("--selftest")) selftest();

const fails = runChecks();
if (fails.length) {
  console.error(`${LABEL} FAIL:\n${fails.map((e) => `  ✗ ${e}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS`);
