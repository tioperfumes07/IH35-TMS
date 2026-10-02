#!/usr/bin/env node
// ROUND 326 queue item 16 (CC-1) — RECLASSIFY, NO SILENT HALF-WRITE. The reclass JE posted first and a document line
// that could not be rewritten was only noted ("ledger moved, line unchanged") — the ledger moved without its
// document. Fails if:
//   1. the per-document loop posts the reclass JE (createJournalEntryOnClient) before rewriting the document lines;
//   2. a line that cannot be rewritten stops aborting its document (ReclassifyDocumentNotRewritableError -> rollback
//      to the savepoint, refused by name).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-reclassify-no-half-write";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/backend/src/accounting/reclassify/reclassify.service.ts";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

export function problems(srcRaw) {
  const p = [];
  const s = strip(srcRaw);
  const loop = s.slice(s.indexOf('await client.query("SAVEPOINT reclass_doc");'));
  const rewriteAt = loop.indexOf("await rewriteDocumentLine(");
  const jeAt = loop.indexOf("createJournalEntryOnClient(");
  if (rewriteAt < 0 || jeAt < 0 || rewriteAt > jeAt) p.push("document lines must be rewritten BEFORE the reclass JE posts");
  if (!/if \(!rw\.updated\) throw new ReclassifyDocumentNotRewritableError\(/.test(loop)) p.push("a line that cannot be rewritten must abort its document (no ledger move without the document)");
  if (!/ROLLBACK TO SAVEPOINT reclass_doc/.test(loop)) p.push("an aborted document must roll back to its savepoint");
  return p;
}

export function run() {
  return problems(readFileSync(path.join(ROOT, FILE), "utf8"));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = readFileSync(path.join(ROOT, FILE), "utf8");
  const own = problems(src);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plants = [
      ["half-write tolerated", src.replace("if (!rw.updated) throw new ReclassifyDocumentNotRewritableError(", "if (!rw.updated) void (")],
      ["JE first", src.replace("const rewrites = new Map", "const je0 = await createJournalEntryOnClient(client as never, {} as never, actor);\n        const rewrites = new Map")],
    ];
    for (const [name, planted] of plants) {
      if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL — ${own.join("; ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — reclassify rewrites the document first and refuses the whole document when it cannot; the ledger never moves alone.`);
}
