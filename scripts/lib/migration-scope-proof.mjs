// Shared static migration corpus helpers for ES1 / child-line scope-inheritance guards.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "../..");
export const MIGRATIONS = path.join(ROOT, "db/migrations");

export const SCOPE_COLS = ["operating_company_id", "tenant_id", "company_id"];

export function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, "");
}

export function loadCorpus() {
  if (!fs.existsSync(MIGRATIONS)) return "";
  return fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => stripComments(fs.readFileSync(path.join(MIGRATIONS, f), "utf8")))
    .join("\n");
}

export function balancedBody(sql, open) {
  let depth = 0;
  for (let i = open; i < sql.length; i += 1) {
    if (sql[i] === "(") depth += 1;
    else if (sql[i] === ")") {
      depth -= 1;
      if (depth === 0) return sql.slice(open + 1, i);
    }
  }
  return null;
}

export function createBodies(corpus, child) {
  const childEsc = child.replace(/\./g, "\\.");
  const re = new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${childEsc}\\s*\\(`, "gi");
  const bodies = [];
  let m;
  while ((m = re.exec(corpus)) !== null) {
    const open = corpus.indexOf("(", m.index);
    if (open >= 0) {
      const body = balancedBody(corpus, open);
      if (body) bodies.push(body);
    }
  }
  return bodies;
}

export function alterStatements(corpus, child) {
  const childEsc = child.replace(/\./g, "\\.");
  const re = new RegExp(`ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?${childEsc}\\b`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(corpus)) !== null) {
    const end = corpus.indexOf(";", m.index);
    out.push(corpus.slice(m.index, end < 0 ? corpus.length : end));
  }
  return out;
}

export function hasEnforcedFk(corpus, child, parentIdCol, parent) {
  const parentEsc = parent.replace(/\./g, "\\.");
  const colEsc = parentIdCol.replace(/[^a-z0-9_]/gi, "");
  const inline = new RegExp(`\\b${colEsc}\\b[^,()]*\\bREFERENCES\\s+${parentEsc}\\s*\\(`, "i");
  for (const body of createBodies(corpus, child)) {
    for (const part of body.split(",")) {
      if (inline.test(part)) return true;
    }
  }
  const fk = new RegExp(
    `FOREIGN\\s+KEY\\s*\\(\\s*${colEsc}\\s*\\)\\s*REFERENCES\\s+${parentEsc}\\s*\\(`,
    "i",
  );
  return alterStatements(corpus, child).some((stmt) => fk.test(stmt));
}

export function hasOwnScopeColumn(corpus, child) {
  for (const body of createBodies(corpus, child)) {
    if (SCOPE_COLS.some((c) => new RegExp(`\\b${c}\\b`, "i").test(body))) return true;
  }
  return false;
}

export function hasForceRls(corpus, table) {
  const esc = table.replace(/\./g, "\\.");
  return new RegExp(`ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?${esc}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i").test(
    corpus,
  );
}

export function hasParentIsolationPolicy(corpus, child, parentIdCol, parent, parentScopeCol = "operating_company_id") {
  const childEsc = child.replace(/\./g, "\\.");
  const parentEsc = parent.replace(/\./g, "\\.");
  const colEsc = parentIdCol.replace(/[^a-z0-9_]/gi, "");
  const scopeEsc = parentScopeCol.replace(/[^a-z0-9_]/gi, "");
  const blockRe = new RegExp(`CREATE\\s+POLICY[\\s\\S]*?ON\\s+${childEsc}\\b[\\s\\S]*?;`, "gi");
  let m;
  while ((m = blockRe.exec(corpus)) !== null) {
    const block = m[0];
    if (!new RegExp(`\\b${colEsc}\\b`).test(block)) continue;
    if (!new RegExp(`\\bFROM\\s+${parentEsc}\\b|\\bFROM\\s+mdata\\.loads\\b`, "i").test(block)) continue;
    if (
      new RegExp(`\\b${scopeEsc}\\b`).test(block) ||
      /user_accessible_company_ids\s*\(\s*\)/.test(block) ||
      /EXISTS\s*\(\s*SELECT\s+1\s+FROM/i.test(block)
    ) {
      return true;
    }
  }
  return false;
}
