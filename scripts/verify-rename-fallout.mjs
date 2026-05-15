#!/usr/bin/env node
/**
 * After ALTER TABLE schema.old RENAME TO new_table (same schema), flag any later
 * migration or code that still references schema.old_table name.
 *
 * Conservative: only handles unquoted identifiers; skips COMMENT-only lines.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIG_DIR = path.join(ROOT, "db", "migrations");

function migSortKey(filename) {
  const m = /^(\d+)/.exec(filename);
  const n = m ? parseInt(m[1], 10) : 999999;
  return [n, filename];
}

function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

function walkFiles(dir, pred) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".") || ent.name === "node_modules") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkFiles(p, pred));
    else if (pred(p)) out.push(p);
  }
  return out;
}

function main() {
  const migrations = fs
    .readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => {
      const ka = migSortKey(a);
      const kb = migSortKey(b);
      return ka[0] - kb[0] || (ka[1] < kb[1] ? -1 : 1);
    });

  const migOrder = new Map(migrations.map((f, i) => [f, i]));

  const renames = [];
  for (const file of migrations) {
    const mig = migSortKey(file)[0];
    const sql = stripComments(fs.readFileSync(path.join(MIG_DIR, file), "utf8"));
    const rt =
      /ALTER\s+TABLE\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\s+RENAME\s+TO\s+([a-z_][a-z0-9_]*)\s*;/gi;
    let m;
    while ((m = rt.exec(sql))) {
      const schema = m[1].toLowerCase();
      const oldTable = m[2].toLowerCase();
      const newTable = m[3].toLowerCase();
      renames.push({
        mig,
        file,
        oldFq: `${schema}.${oldTable}`,
        newFq: `${schema}.${newTable}`,
      });
    }
  }

  const hits = [];
  const oldFqPattern = (oldFq) =>
    new RegExp(`\\b${oldFq.replace(".", "\\.")}\\b`, "g");

  function skipVerifierScript(fp) {
    return (
      /verify-canonical-schema-names\.mjs$/.test(fp) ||
      /verify-rename-fallout\.mjs$/.test(fp) ||
      /verify-reference-before-introduction\.mjs$/.test(fp) ||
      /verify-backend-schema-contract\.mjs$/.test(fp)
    );
  }

  for (const r of renames) {
    const pat = oldFqPattern(r.oldFq);
    const renameOrdinal = migOrder.get(r.file);
    for (const file of migrations) {
      const ordF = migOrder.get(file);
      if (ordF < renameOrdinal) continue;
      const raw = fs.readFileSync(path.join(MIG_DIR, file), "utf8");
      const sql = stripComments(raw);
      pat.lastIndex = 0;
      if (!pat.test(sql)) continue;
      pat.lastIndex = 0;
      let mm;
      while ((mm = pat.exec(sql))) {
        const lineStart = sql.lastIndexOf("\n", mm.index) + 1;
        const nl = sql.indexOf("\n", mm.index);
        const line = nl === -1 ? sql.slice(lineStart) : sql.slice(lineStart, nl);
        if (/rename\s+to/i.test(line)) continue;
        if (
          new RegExp(`to_regclass\\s*\\(\\s*'${r.oldFq.replace(".", "\\.")}'`, "i").test(
            line,
          )
        )
          continue;
        hits.push({
          kind: "migration",
          oldFq: r.oldFq,
          newFq: r.newFq,
          renamedInMig: r.mig,
          renamedInFile: r.file,
          hitFile: file,
          hitMig: migSortKey(file)[0],
          snippet: line.trim().slice(0, 120),
        });
      }
    }

    const scanDirs = [
      path.join(ROOT, "apps", "backend", "src"),
      path.join(ROOT, "scripts"),
    ];
    for (const dir of scanDirs) {
      for (const fp of walkFiles(
        dir,
        (p) =>
          /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(p) &&
          !p.includes(`${path.sep}dist${path.sep}`),
      )) {
        if (skipVerifierScript(fp)) continue;
        const text = fs.readFileSync(fp, "utf8");
        pat.lastIndex = 0;
        if (pat.test(text)) {
          hits.push({
            kind: "code",
            oldFq: r.oldFq,
            newFq: r.newFq,
            renamedInMig: r.mig,
            renamedInFile: r.file,
            hitFile: path.relative(ROOT, fp),
          });
        }
      }
    }
  }

  const unique = [];
  const seen = new Set();
  for (const h of hits) {
    const key = `${h.kind}|${h.oldFq}|${h.hitFile}|${h.hitMig ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(h);
  }

  if (unique.length > 0) {
    console.error("\ndb:verify:rename-fallout — stale references after RENAME TO:\n");
    for (const h of unique) {
      console.error(
        `  After ${h.oldFq} → ${h.newFq} (migration ${h.renamedInMig}, ${h.renamedInFile})`,
      );
      console.error(`    hit: ${h.kind} ${h.hitFile}${h.hitMig != null ? ` (mig ${h.hitMig})` : ""}`);
      if (h.snippet) console.error(`    line: ${h.snippet}`);
    }
    console.error(`\nTotal: ${unique.length}\n`);
    process.exit(1);
  }

  console.log("db:verify:rename-fallout — OK (no stale post-rename identifiers found)");
}

main();
